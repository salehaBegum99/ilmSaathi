import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { AppConfig } from "../config/env.js";
import { AppError } from "./errors.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const ACCESS_COOKIE = "lp_access";
export const REFRESH_COOKIE = "lp_refresh";
export const CSRF_COOKIE = "lp_csrf";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function keyedHash(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function hashPassword(password: string, rounds: number): Promise<string> {
  return bcrypt.hash(password, rounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createRefreshSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function serializeRefreshCookie(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

export function parseRefreshCookie(value: string | undefined): {
  sessionId: string;
  secret: string;
} {
  if (!value) throw new AppError(401, "refresh_required", "A valid refresh session is required");
  const separator = value.indexOf(".");
  const sessionId = value.slice(0, separator);
  const secret = value.slice(separator + 1);
  if (!/^[a-f\d]{24}$/i.test(sessionId) || secret.length < 32) {
    throw new AppError(401, "refresh_invalid", "The refresh session is invalid");
  }
  return { sessionId, secret };
}

export function issueCsrfToken(secret: string): string {
  const nonce = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", secret).update(nonce).digest("base64url");
  return `${nonce}.${signature}`;
}

export function verifyCsrfToken(token: string, secret: string): boolean {
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const nonce = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{24,}$/.test(nonce)) return false;
  const expected = createHmac("sha256", secret).update(nonce).digest("base64url");
  return safeEqual(signature, expected);
}

export function verifyAccessToken(
  token: string,
  config: AppConfig,
): { userId: string; sessionId: string } {
  let payload: JwtPayload;
  try {
    const decoded = jwt.verify(token, config.auth.jwtAccessSecret, {
      algorithms: ["HS256"],
      audience: config.auth.jwtAudience,
      issuer: config.auth.jwtIssuer,
      complete: false,
    });
    if (typeof decoded === "string") throw new Error("Unexpected JWT payload");
    payload = decoded;
  } catch {
    throw new AppError(401, "access_invalid", "The access session is invalid or expired");
  }
  if (!payload.sub || typeof payload["sid"] !== "string") {
    throw new AppError(401, "access_invalid", "The access session is invalid or expired");
  }
  return { userId: payload.sub, sessionId: payload["sid"] };
}

export function signAccessTokenWithSession(
  userId: string,
  sessionId: string,
  config: AppConfig,
): string {
  return jwt.sign({ sid: sessionId }, config.auth.jwtAccessSecret, {
    algorithm: "HS256",
    audience: config.auth.jwtAudience,
    issuer: config.auth.jwtIssuer,
    subject: userId,
    jwtid: randomBytes(12).toString("hex"),
    expiresIn: config.auth.accessTtlSeconds,
  });
}

export function encryptMfaSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, encrypted, cipher.getAuthTag()].map((part) => part.toString("base64url")).join(".");
}

export function decryptMfaSecret(value: string, key: Buffer): string {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted MFA secret");
  const [ivValue, encryptedValue, tagValue] = parts;
  if (!ivValue || !encryptedValue || !tagValue) throw new Error("Invalid encrypted MFA secret");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 data");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function totpAtCounter(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(
  token: string,
  secret: string,
  lastUsedCounter: number | null,
  now = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(token)) return null;
  const currentCounter = Math.floor(now / 30_000);
  for (const offset of [-1, 0, 1]) {
    const counter = currentCounter + offset;
    if (counter <= (lastUsedCounter ?? -1)) continue;
    if (safeEqual(token, totpAtCounter(secret, counter))) return counter;
  }
  return null;
}

export function createTotpUri(secret: string, issuer: string, account: string): string {
  const label = `${issuer}:${account}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

// Derived rather than a new top-level secret: keeps document-access signing independent from
// the raw audit HMAC key without requiring every existing .env to add one more required value.
export function deriveDocumentAccessSecret(auditHmacSecret: string): string {
  return keyedHash("verification-document-access", auditHmacSecret);
}

export function signDocumentAccessToken(documentId: string, secret: string, expiresAt: Date): string {
  const expiresAtMs = String(expiresAt.getTime());
  const signature = keyedHash(`${documentId}.${expiresAtMs}`, secret);
  return `${documentId}.${expiresAtMs}.${signature}`;
}

export function verifyDocumentAccessToken(
  token: string,
  documentId: string,
  secret: string,
  now = new Date(),
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [tokenDocumentId, expiresAtRaw, signature] = parts;
  if (tokenDocumentId !== documentId) return false;
  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < now.getTime()) return false;
  const expected = keyedHash(`${tokenDocumentId}.${expiresAtRaw}`, secret);
  return safeEqual(signature!, expected);
}
