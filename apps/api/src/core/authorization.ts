import type { UserRole } from "@learning-platform/shared";
import { AppError } from "./errors.js";

export interface AuthPrincipal {
  userId: string;
  email: string;
  sessionId: string;
  roles: UserRole[];
  mfaVerifiedAt: Date | null;
}

export function assertRole(principal: AuthPrincipal, allowed: readonly UserRole[]): void {
  if (!principal.roles.some((role) => allowed.includes(role))) {
    throw new AppError(403, "forbidden", "You do not have permission to perform this action");
  }
}

export function assertAal2(
  principal: AuthPrincipal,
  maxAgeSeconds: number,
  now = new Date(),
): void {
  if (!principal.mfaVerifiedAt) {
    throw new AppError(403, "mfa_required", "Multi-factor authentication is required");
  }
  const ageMilliseconds = now.getTime() - principal.mfaVerifiedAt.getTime();
  if (ageMilliseconds < 0 || ageMilliseconds > maxAgeSeconds * 1_000) {
    throw new AppError(403, "mfa_expired", "Multi-factor authentication must be repeated");
  }
}

export function assertAdminAal2(
  principal: AuthPrincipal,
  maxAgeSeconds: number,
  now = new Date(),
): void {
  assertRole(principal, ["admin"]);
  assertAal2(principal, maxAgeSeconds, now);
}
