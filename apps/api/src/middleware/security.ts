import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserRole } from "@learning-platform/shared";
import type { AppConfig } from "../config/env.js";
import { assertAal2, assertRole } from "../core/authorization.js";
import { AppError } from "../core/errors.js";
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  issueCsrfToken,
  safeEqual,
  verifyCsrfToken,
} from "../core/security.js";
import type { AuthServiceContract, RequestMetadata, SessionTokens } from "../services/types.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const requestContext: RequestHandler = (request, response, next) => {
  const supplied = request.header("x-request-id");
  request.requestId = supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied) ? supplied : randomUUID();
  response.setHeader("x-request-id", request.requestId);
  next();
};

export function csrfProtection(config: AppConfig): RequestHandler {
  return (request, _response, next) => {
    if (SAFE_METHODS.has(request.method)) return next();
    const cookieToken = request.cookies?.[CSRF_COOKIE] as string | undefined;
    const headerValue = request.header("x-csrf-token");
    if (
      !cookieToken ||
      !headerValue ||
      !safeEqual(cookieToken, headerValue) ||
      !verifyCsrfToken(headerValue, config.auth.csrfSecret)
    ) {
      return next(new AppError(403, "csrf_invalid", "A valid CSRF token is required"));
    }
    request.csrfToken = headerValue;
    next();
  };
}

export function requireAuthentication(auth: AuthServiceContract): RequestHandler {
  return async (request, _response, next) => {
    try {
      const accessToken = request.cookies?.[ACCESS_COOKIE] as string | undefined;
      if (!accessToken) throw new AppError(401, "authentication_required", "Sign in is required");
      request.principal = await auth.authenticateAccess(
        accessToken,
        SAFE_METHODS.has(request.method) ? undefined : request.csrfToken,
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRoles(...roles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    try {
      if (!request.principal) throw new AppError(401, "authentication_required", "Sign in is required");
      assertRole(request.principal, roles);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireMfa(maxAgeSeconds: number): RequestHandler {
  return (request, _response, next) => {
    try {
      if (!request.principal) throw new AppError(401, "authentication_required", "Sign in is required");
      assertAal2(request.principal, maxAgeSeconds);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function commonCookieOptions(config: AppConfig) {
  return {
    secure: config.http.cookieSecure,
    sameSite: config.http.cookieSameSite,
    ...(config.http.cookieDomain ? { domain: config.http.cookieDomain } : {}),
  } as const;
}

export function setSessionCookies(response: Response, tokens: SessionTokens, config: AppConfig): void {
  const common = commonCookieOptions(config);
  response.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...common,
    httpOnly: true,
    path: "/",
    maxAge: tokens.accessMaxAgeMs,
  });
  response.cookie(REFRESH_COOKIE, tokens.refreshCookieValue, {
    ...common,
    httpOnly: true,
    path: "/api/v1/auth",
    maxAge: tokens.refreshMaxAgeMs,
  });
  response.cookie(CSRF_COOKIE, tokens.csrfToken, {
    ...common,
    httpOnly: false,
    path: "/",
    maxAge: tokens.refreshMaxAgeMs,
  });
  response.setHeader("Cache-Control", "no-store");
}

export function setRenewedAccessCookie(
  response: Response,
  accessToken: string,
  maxAgeMs: number,
  config: AppConfig,
): void {
  response.cookie(ACCESS_COOKIE, accessToken, {
    ...commonCookieOptions(config),
    httpOnly: true,
    path: "/",
    maxAge: maxAgeMs,
  });
  response.setHeader("Cache-Control", "no-store");
}

export function clearSessionCookies(response: Response, config: AppConfig): void {
  const common = commonCookieOptions(config);
  response.clearCookie(ACCESS_COOKIE, { ...common, httpOnly: true, path: "/" });
  response.clearCookie(REFRESH_COOKIE, {
    ...common,
    httpOnly: true,
    path: "/api/v1/auth",
  });
  response.clearCookie(CSRF_COOKIE, { ...common, httpOnly: false, path: "/" });
  response.setHeader("Cache-Control", "no-store");
}

export function getOrIssueCsrf(request: Request, response: Response, config: AppConfig): string {
  const existing = request.cookies?.[CSRF_COOKIE] as string | undefined;
  if (existing && verifyCsrfToken(existing, config.auth.csrfSecret)) return existing;
  const token = issueCsrfToken(config.auth.csrfSecret);
  response.cookie(CSRF_COOKIE, token, {
    ...commonCookieOptions(config),
    httpOnly: false,
    path: "/",
    maxAge: config.auth.refreshTtlSeconds * 1_000,
  });
  return token;
}

export function requestMetadata(request: Request): RequestMetadata {
  return {
    ipAddress: request.ip || "unknown",
    userAgent: (request.header("user-agent") ?? "unknown").slice(0, 500),
  };
}

export function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}
