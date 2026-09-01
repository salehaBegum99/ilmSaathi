import type {
  CurrentUserDto,
  LoginInput,
  ProfileDto,
  RegistrationInput,
  UserRole,
} from "@learning-platform/shared";
import type { ClientSession } from "mongoose";
import type { AppConfig } from "../config/env.js";
import { assertRole, type AuthPrincipal } from "../core/authorization.js";
import { AppError } from "../core/errors.js";
import {
  createRefreshSecret,
  decryptMfaSecret,
  hashPassword,
  issueCsrfToken,
  keyedHash,
  parseRefreshCookie,
  safeEqual,
  serializeRefreshCookie,
  sha256,
  signAccessTokenWithSession,
  verifyAccessToken,
  verifyPassword,
  verifyTotp,
} from "../core/security.js";
import type { Repositories } from "../repositories/index.js";
import { inTransaction } from "../repositories/index.js";
import type {
  AuthResponse,
  AuthServiceContract,
  RequestMetadata,
  SessionTokens,
} from "./types.js";

export class AuthService implements AuthServiceContract {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly repositories: Repositories,
    private readonly config: AppConfig,
    private readonly runInTransaction: typeof inTransaction = inTransaction,
  ) {
    this.dummyHash = hashPassword("invalid-password-0", config.auth.bcryptRounds);
  }

  async register(input: RegistrationInput, metadata: RequestMetadata): Promise<AuthResponse> {
    if (
      input.termsVersion !== this.config.auth.termsVersion ||
      input.privacyVersion !== this.config.auth.privacyVersion
    ) {
      throw new AppError(
        409,
        "consent_version_outdated",
        "Please review and accept the current terms and privacy notice",
      );
    }

    const now = new Date();
    const passwordHash = await hashPassword(input.password, this.config.auth.bcryptRounds);
    const ipHash = keyedHash(metadata.ipAddress, this.config.auth.auditHmacSecret);
    const { user, tokens } = await this.runInTransaction(async (session) => {
      const created = await this.repositories.users.create(
        { email: input.email, passwordHash, roles: [input.role] },
        session,
      );
      await this.repositories.profiles.createForRegistration(
        created.id,
        input.role === "educator" ? now : null,
        session,
      );
      await this.repositories.consents.recordRegistration(
        {
          userId: created.id,
          termsVersion: input.termsVersion,
          privacyVersion: input.privacyVersion,
          ipHash,
          occurredAt: now,
        },
        session,
      );
      return {
        user: created,
        tokens: await this.createSession(created.id, metadata, now, session),
      };
    });

    return {
      user: this.makeCurrentUser(user, null, false),
      mfaRequired: false,
      tokens,
    };
  }

  async login(input: LoginInput, metadata: RequestMetadata): Promise<AuthResponse> {
    const user = await this.repositories.users.findByEmailForLogin(input.email);
    const passwordMatches = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user || !passwordMatches) {
      throw new AppError(401, "invalid_credentials", "Email or password is incorrect");
    }
    if (user.accountStatus !== "active") {
      throw new AppError(403, "account_unavailable", "This account is not available");
    }

    const now = new Date();
    const profile = await this.repositories.profiles.findByOwner(user.id);
    const tokens = await this.runInTransaction(async (session) => {
      const createdTokens = await this.createSession(user.id, metadata, now, session);
      await this.repositories.users.recordLogin(user.id, now, session);
      if (user.roles.includes("admin")) {
        await this.repositories.audit.append({
          actorId: user.id,
          action: "admin.auth.password_succeeded",
          targetType: "user",
          targetId: user.id,
          securityContext: this.auditContext(metadata, createdTokens, 1),
          occurredAt: now,
          session,
        });
      }
      return createdTokens;
    });
    return {
      user: this.makeCurrentUser(user, profile, false),
      mfaRequired: user.roles.includes("admin"),
      tokens,
    };
  }

  async authenticateAccess(accessToken: string, csrfToken?: string): Promise<AuthPrincipal> {
    const claims = verifyAccessToken(accessToken, this.config);
    const now = new Date();
    const [session, user] = await Promise.all([
      this.repositories.sessions.findActive(claims.sessionId, now),
      this.repositories.users.findPrincipalById(claims.userId),
    ]);
    if (!session || session.userId !== claims.userId || !user || user.accountStatus !== "active") {
      throw new AppError(401, "access_invalid", "The access session is invalid or expired");
    }
    if (csrfToken && (!session.csrfTokenHash || !safeEqual(sha256(csrfToken), session.csrfTokenHash))) {
      throw new AppError(403, "csrf_session_mismatch", "The CSRF token does not match this session");
    }
    return {
      userId: user.id,
      email: user.email,
      sessionId: session.id,
      roles: user.roles,
      mfaVerifiedAt: session.mfaVerifiedAt,
    };
  }

  async getMe(principal: AuthPrincipal): Promise<CurrentUserDto> {
    const profile = await this.repositories.profiles.findByOwner(principal.userId);
    return this.makeCurrentUser(
      { id: principal.userId, email: principal.email, roles: principal.roles },
      profile,
      Boolean(principal.mfaVerifiedAt),
    );
  }

  async refresh(
    refreshCookieValue: string | undefined,
    csrfToken: string,
    metadata: RequestMetadata,
  ): Promise<AuthResponse> {
    const parsed = parseRefreshCookie(refreshCookieValue);
    const now = new Date();
    const session = await this.repositories.sessions.findForRefresh(parsed.sessionId, now);
    if (!session || !session.csrfTokenHash || !session.refreshTokenHash) {
      throw new AppError(401, "refresh_invalid", "The refresh session is invalid");
    }
    if (!safeEqual(sha256(csrfToken), session.csrfTokenHash)) {
      throw new AppError(403, "csrf_session_mismatch", "The CSRF token does not match this session");
    }
    const presentedHash = sha256(parsed.secret);
    if (!safeEqual(presentedHash, session.refreshTokenHash)) {
      await this.repositories.sessions.revoke(session.id, "refresh_token_mismatch", now);
      throw new AppError(401, "refresh_invalid", "The refresh session is invalid");
    }
    const [user, profile] = await Promise.all([
      this.repositories.users.findPrincipalById(session.userId),
      this.repositories.profiles.findByOwner(session.userId),
    ]);
    if (!user || user.accountStatus !== "active") {
      await this.repositories.sessions.revoke(session.id, "account_unavailable", now);
      throw new AppError(401, "refresh_invalid", "The refresh session is invalid");
    }

    const newRefreshSecret = createRefreshSecret();
    const rotated = await this.repositories.sessions.rotate({
      id: session.id,
      expectedRefreshHash: presentedHash,
      newRefreshHash: sha256(newRefreshSecret),
      ipHash: keyedHash(metadata.ipAddress, this.config.auth.auditHmacSecret),
      userAgent: metadata.userAgent,
      now,
    });
    if (!rotated) {
      await this.repositories.sessions.revoke(session.id, "refresh_rotation_race", now);
      throw new AppError(401, "refresh_reused", "The refresh session was already used");
    }
    return {
      user: this.makeCurrentUser(user, profile, Boolean(session.mfaVerifiedAt)),
      mfaRequired: user.roles.includes("admin") && !session.mfaVerifiedAt,
      // Keep the CSRF value stable for the session. Rotating it with the refresh secret would
      // make a replayed old pair fail CSRF before refresh-token reuse can be detected/revoked.
      tokens: this.makeTokens(user.id, session.id, newRefreshSecret, csrfToken),
    };
  }

  async logout(refreshCookieValue: string | undefined, csrfToken: string): Promise<void> {
    let parsed: ReturnType<typeof parseRefreshCookie>;
    try {
      parsed = parseRefreshCookie(refreshCookieValue);
    } catch {
      // Logout is intentionally idempotent and never reveals whether a cookie named a session.
      return;
    }
    const session = await this.repositories.sessions.findForRefresh(parsed.sessionId, new Date());
    if (
      session?.csrfTokenHash &&
      session.refreshTokenHash &&
      safeEqual(sha256(csrfToken), session.csrfTokenHash) &&
      safeEqual(sha256(parsed.secret), session.refreshTokenHash)
    ) {
      await this.repositories.sessions.revoke(session.id, "user_logout", new Date());
    }
  }

  async verifyAdminTotp(
    principal: AuthPrincipal,
    code: string,
    metadata: RequestMetadata,
  ) {
    assertRole(principal, ["admin"]);
    const user = await this.repositories.users.findMfaById(principal.userId);
    if (
      !user?.mfaTotpEnabled ||
      !user.encryptedSecret ||
      user.accountStatus !== "active"
    ) {
      throw new AppError(403, "mfa_not_configured", "Administrator MFA is not configured");
    }
    let secret: string;
    try {
      secret = decryptMfaSecret(user.encryptedSecret, this.config.mfa.encryptionKey);
    } catch {
      throw new AppError(500, "mfa_configuration_error", "Administrator MFA cannot be verified");
    }
    const counter = verifyTotp(code, secret, user.lastUsedCounter);
    if (counter === null) {
      throw new AppError(401, "mfa_invalid", "The authentication code is invalid or already used");
    }
    const now = new Date();
    await this.runInTransaction(async (session) => {
      if (!(await this.repositories.users.recordTotpUse(user.id, counter, session))) {
        throw new AppError(401, "mfa_invalid", "The authentication code is invalid or already used");
      }
      await this.repositories.sessions.setMfaVerified(principal.sessionId, now, session);
      await this.repositories.audit.append({
        actorId: user.id,
        action: "admin.auth.mfa_succeeded",
        targetType: "auth_session",
        targetId: principal.sessionId,
        securityContext: {
          ipHash: keyedHash(metadata.ipAddress, this.config.auth.auditHmacSecret),
          userAgent: metadata.userAgent,
          sessionId: principal.sessionId,
          aal: 2,
        },
        occurredAt: now,
        session,
      });
      return true;
    });
    const profile = await this.repositories.profiles.findByOwner(user.id);
    return {
      accessToken: signAccessTokenWithSession(user.id, principal.sessionId, this.config),
      accessMaxAgeMs: this.config.auth.accessTtlSeconds * 1_000,
      user: this.makeCurrentUser(user, profile, true),
    };
  }

  private async createSession(
    userId: string,
    metadata: RequestMetadata,
    now: Date,
    session?: ClientSession,
  ): Promise<SessionTokens> {
    const refreshSecret = createRefreshSecret();
    const csrfToken = issueCsrfToken(this.config.auth.csrfSecret);
    const createdSession = await this.repositories.sessions.create({
      userId,
      refreshTokenHash: sha256(refreshSecret),
      csrfTokenHash: sha256(csrfToken),
      expiresAt: new Date(now.getTime() + this.config.auth.refreshTtlSeconds * 1_000),
      ipHash: keyedHash(metadata.ipAddress, this.config.auth.auditHmacSecret),
      userAgent: metadata.userAgent,
      now,
      ...(session ? { session } : {}),
    });
    return this.makeTokens(userId, createdSession.id, refreshSecret, csrfToken);
  }

  private makeTokens(
    userId: string,
    sessionId: string,
    refreshSecret: string,
    csrfToken: string,
  ): SessionTokens {
    return {
      accessToken: signAccessTokenWithSession(userId, sessionId, this.config),
      refreshCookieValue: serializeRefreshCookie(sessionId, refreshSecret),
      csrfToken,
      accessMaxAgeMs: this.config.auth.accessTtlSeconds * 1_000,
      refreshMaxAgeMs: this.config.auth.refreshTtlSeconds * 1_000,
    };
  }

  private auditContext(metadata: RequestMetadata, tokens: SessionTokens, aal: 1 | 2) {
    const sessionId = tokens.refreshCookieValue.split(".", 1)[0];
    if (!sessionId) throw new Error("Created refresh cookie did not contain a session identifier");
    return {
      ipHash: keyedHash(metadata.ipAddress, this.config.auth.auditHmacSecret),
      userAgent: metadata.userAgent,
      sessionId,
      aal,
    };
  }

  private makeCurrentUser(
    user: { id: string; email: string; roles: UserRole[] },
    profile: ProfileDto | null,
    mfaVerified: boolean,
  ): CurrentUserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: profile?.displayName ?? "",
      roles: user.roles,
      ...(profile?.preferredLanguage
        ? { preferredLanguage: profile.preferredLanguage }
        : {}),
      onboardingComplete: Boolean(profile?.onboardingCompletedAt),
      mfaVerified,
    };
  }
}
