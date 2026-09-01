import { Router } from "express";
import {
  loginSchema,
  registrationSchema,
  totpChallengeSchema,
} from "@learning-platform/shared";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../core/errors.js";
import { CSRF_COOKIE, REFRESH_COOKIE } from "../core/security.js";
import {
  asyncRoute,
  clearSessionCookies,
  getOrIssueCsrf,
  requestMetadata,
  requireAuthentication,
  requireRoles,
  setRenewedAccessCookie,
  setSessionCookies,
} from "../middleware/security.js";
import type { AuthServiceContract } from "../services/types.js";

export function createAuthRouter(auth: AuthServiceContract, config: AppConfig) {
  const router = Router();

  router.get("/csrf", (request, response) => {
    const csrfToken = getOrIssueCsrf(request, response, config);
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
      csrfToken,
      termsVersion: config.auth.termsVersion,
      privacyVersion: config.auth.privacyVersion,
    });
  });

  router.post(
    "/register",
    asyncRoute(async (request, response) => {
      const input = registrationSchema.parse(request.body);
      const result = await auth.register(input, requestMetadata(request));
      setSessionCookies(response, result.tokens, config);
      response.status(201).json({ user: result.user, mfaRequired: result.mfaRequired });
    }),
  );

  router.post(
    "/login",
    asyncRoute(async (request, response) => {
      const input = loginSchema.parse(request.body);
      const result = await auth.login(input, requestMetadata(request));
      setSessionCookies(response, result.tokens, config);
      response.status(200).json({ user: result.user, mfaRequired: result.mfaRequired });
    }),
  );

  router.post(
    "/refresh",
    asyncRoute(async (request, response) => {
      if (!request.csrfToken) throw new AppError(403, "csrf_invalid", "A CSRF token is required");
      const result = await auth.refresh(
        request.cookies?.[REFRESH_COOKIE] as string | undefined,
        request.csrfToken,
        requestMetadata(request),
      );
      setSessionCookies(response, result.tokens, config);
      response.status(200).json({ user: result.user, mfaRequired: result.mfaRequired });
    }),
  );

  router.post(
    "/logout",
    asyncRoute(async (request, response) => {
      if (!request.csrfToken) throw new AppError(403, "csrf_invalid", "A CSRF token is required");
      await auth.logout(
        request.cookies?.[REFRESH_COOKIE] as string | undefined,
        request.csrfToken,
      );
      clearSessionCookies(response, config);
      response.status(204).send();
    }),
  );

  router.post(
    "/mfa/totp",
    requireAuthentication(auth),
    requireRoles("admin"),
    asyncRoute(async (request, response) => {
      const { code } = totpChallengeSchema.parse(request.body);
      const principal = request.principal!;
      const tokens = await auth.verifyAdminTotp(principal, code, requestMetadata(request));
      setRenewedAccessCookie(response, tokens.accessToken, tokens.accessMaxAgeMs, config);
      response.status(200).json({ verified: true });
    }),
  );

  router.get(
    "/me",
    requireAuthentication(auth),
    asyncRoute(async (request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({
        user: {
          id: request.principal!.userId,
          roles: request.principal!.roles,
          mfaVerified: Boolean(request.principal!.mfaVerifiedAt),
        },
      });
    }),
  );

  return router;
}
