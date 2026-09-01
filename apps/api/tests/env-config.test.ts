import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    MONGODB_URI: "mongodb://127.0.0.1:27018/test",
    JWT_ACCESS_SECRET: "a".repeat(32),
    CSRF_SECRET: "b".repeat(32),
    AUDIT_HMAC_SECRET: "c".repeat(32),
    MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
    CORS_ORIGINS: "http://localhost:5173",
    CURRENT_TERMS_VERSION: "2026-08-30",
    CURRENT_PRIVACY_VERSION: "2026-08-30",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe("email environment parsing", () => {
  // The generated local .env ships unfilled secrets as "KEY=" (present, empty string), not
  // absent. EMAIL_FROM/RESEND_API_KEY must treat that the same as unset, or the API fails to
  // start on every fresh checkout.
  it("treats blank EMAIL_FROM/RESEND_API_KEY as unset rather than invalid", () => {
    const config = loadConfig(baseEnv({ EMAIL_FROM: "", RESEND_API_KEY: "" }));
    expect(config.email.from).toBeNull();
    expect(config.email.resendApiKey).toBeNull();
  });

  it("accepts a real EMAIL_FROM/RESEND_API_KEY pair", () => {
    const config = loadConfig(baseEnv({ EMAIL_FROM: "noreply@example.com", RESEND_API_KEY: "re_test_key" }));
    expect(config.email.from).toBe("noreply@example.com");
    expect(config.email.resendApiKey).toBe("re_test_key");
  });

  it("rejects a malformed EMAIL_FROM", () => {
    expect(() => loadConfig(baseEnv({ EMAIL_FROM: "not-an-email", RESEND_API_KEY: "re_test_key" }))).toThrow();
  });

  it("rejects EMAIL_FROM set without a matching RESEND_API_KEY", () => {
    expect(() => loadConfig(baseEnv({ EMAIL_FROM: "noreply@example.com" }))).toThrow();
  });

  it("defaults WEB_URL when unset", () => {
    const config = loadConfig(baseEnv());
    expect(config.webUrl).toBe("http://localhost:5173");
  });
});
