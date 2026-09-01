import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const optionalBooleanFromString = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z.string().min(1).max(64).optional(),
    MONGODB_CONNECT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
    MONGODB_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(50).max(5_000).default(400),
    MONGODB_AUTO_INDEX: optionalBooleanFromString,
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ISSUER: z.string().min(1).default("learning-platform-api"),
    JWT_AUDIENCE: z.string().min(1).default("learning-platform-web"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3_600)
      .max(90 * 24 * 3_600)
      .default(30 * 24 * 3_600),
    CSRF_SECRET: z.string().min(32),
    AUDIT_HMAC_SECRET: z.string().min(32),
    MFA_ENCRYPTION_KEY_BASE64: z.string().refine(
      (value) => {
        try {
          const decoded = Buffer.from(value, "base64");
          return (
            /^[A-Za-z0-9+/]{43}=$/.test(value) &&
            decoded.byteLength === 32 &&
            decoded.toString("base64") === value
          );
        } catch {
          return false;
        }
      },
      "MFA_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes",
    ),
    MFA_ISSUER: z.string().min(1).max(80).default("Women Learning Platform"),
    MFA_MAX_AGE_SECONDS: z.coerce.number().int().min(300).max(86_400).default(43_200),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
    CORS_ORIGINS: z.string().min(1),
    COOKIE_SECURE: optionalBooleanFromString,
    COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
    COOKIE_DOMAIN: z.string().min(1).optional(),
    TRUST_PROXY: booleanFromString.default("false"),
    CURRENT_TERMS_VERSION: z.string().min(1).max(50),
    CURRENT_PRIVACY_VERSION: z.string().min(1).max(50),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(3_600_000)
      .default(900_000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(3).max(100).default(10),
    API_RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(10_000).default(300),
    SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
    WEB_URL: z.string().url().default("http://localhost:5173"),
    // Blank-but-present is how the generated local .env ships unfilled secrets (see
    // RAZORPAY_KEY_ID and friends); treat "" the same as unset rather than an invalid email.
    EMAIL_FROM: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined))
      .refine((value) => value === undefined || z.string().email().safeParse(value).success, {
        message: "EMAIL_FROM must be a valid email address",
      }),
    RESEND_API_KEY: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined)),
    MAX_UPLOAD_BYTES: z.coerce.number().int().min(100_000).max(20_000_000).default(5_242_880),
    UPLOAD_DIR: z.string().min(1).default("./private-uploads"),
  })
  .superRefine((env, context) => {
    const secure = env.COOKIE_SECURE ?? env.NODE_ENV === "production";
    if (env.NODE_ENV === "production" && !secure) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE cannot be false in production",
      });
    }
    if (env.COOKIE_SAME_SITE === "none" && !secure) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COOKIE_SAME_SITE"],
        message: "SameSite=None cookies require COOKIE_SECURE=true",
      });
    }
    const secrets = [env.JWT_ACCESS_SECRET, env.CSRF_SECRET, env.AUDIT_HMAC_SECRET];
    if (new Set(secrets).size !== secrets.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ACCESS_SECRET"],
        message: "JWT, CSRF and audit HMAC secrets must be independent",
      });
    }
    if (Boolean(env.EMAIL_FROM) !== Boolean(env.RESEND_API_KEY)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EMAIL_FROM"],
        message: "EMAIL_FROM and RESEND_API_KEY must both be set or both be omitted",
      });
    }
  });

export interface AppConfig {
  env: "development" | "test" | "production";
  port: number;
  mongo: {
    uri: string;
    dbName?: string;
    maxAttempts: number;
    connectTimeoutMs: number;
    retryBaseDelayMs: number;
    autoIndex: boolean;
  };
  auth: {
    jwtAccessSecret: string;
    jwtIssuer: string;
    jwtAudience: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
    csrfSecret: string;
    auditHmacSecret: string;
    bcryptRounds: number;
    termsVersion: string;
    privacyVersion: string;
  };
  mfa: {
    encryptionKey: Buffer;
    issuer: string;
    maxAgeSeconds: number;
  };
  http: {
    corsOrigins: string[];
    cookieSecure: boolean;
    cookieSameSite: "strict" | "lax" | "none";
    cookieDomain?: string;
    trustProxy: boolean;
    authRateLimitWindowMs: number;
    authRateLimitMax: number;
    apiRateLimitMax: number;
  };
  shutdownGraceMs: number;
  webUrl: string;
  email: {
    from: string | null;
    resendApiKey: string | null;
  };
  uploads: {
    maxBytes: number;
    dir: string;
  };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const summary = result.error.issues
      .map(({ path, message }) => `${path.join(".") || "environment"}: ${message}`)
      .join("; ");
    throw new Error(`Invalid API environment: ${summary}`);
  }

  const env = result.data;
  const corsOrigins = env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const url = new URL(origin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        throw new Error(`CORS_ORIGINS entry is not an HTTP(S) origin: ${origin}`);
      }
      if (env.NODE_ENV === "production" && url.protocol !== "https:") {
        throw new Error("CORS_ORIGINS must use HTTPS in production");
      }
      return url.origin;
    });

  if (corsOrigins.length === 0 || new Set(corsOrigins).size !== corsOrigins.length) {
    throw new Error("Invalid API environment: CORS_ORIGINS must contain unique URL origins");
  }

  const cookieSecure = env.COOKIE_SECURE ?? env.NODE_ENV === "production";
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    mongo: {
      uri: env.MONGODB_URI,
      ...(env.MONGODB_DB_NAME ? { dbName: env.MONGODB_DB_NAME } : {}),
      maxAttempts: env.MONGODB_CONNECT_MAX_ATTEMPTS,
      connectTimeoutMs: env.MONGODB_CONNECT_TIMEOUT_MS,
      retryBaseDelayMs: env.MONGODB_RETRY_BASE_DELAY_MS,
      autoIndex: env.MONGODB_AUTO_INDEX ?? env.NODE_ENV !== "production",
    },
    auth: {
      jwtAccessSecret: env.JWT_ACCESS_SECRET,
      jwtIssuer: env.JWT_ISSUER,
      jwtAudience: env.JWT_AUDIENCE,
      accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
      csrfSecret: env.CSRF_SECRET,
      auditHmacSecret: env.AUDIT_HMAC_SECRET,
      bcryptRounds: env.BCRYPT_ROUNDS,
      termsVersion: env.CURRENT_TERMS_VERSION,
      privacyVersion: env.CURRENT_PRIVACY_VERSION,
    },
    mfa: {
      encryptionKey: Buffer.from(env.MFA_ENCRYPTION_KEY_BASE64, "base64"),
      issuer: env.MFA_ISSUER,
      maxAgeSeconds: env.MFA_MAX_AGE_SECONDS,
    },
    http: {
      corsOrigins,
      cookieSecure,
      cookieSameSite: env.COOKIE_SAME_SITE,
      ...(env.COOKIE_DOMAIN ? { cookieDomain: env.COOKIE_DOMAIN } : {}),
      trustProxy: env.TRUST_PROXY,
      authRateLimitWindowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
      authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
      apiRateLimitMax: env.API_RATE_LIMIT_MAX,
    },
    shutdownGraceMs: env.SHUTDOWN_GRACE_MS,
    webUrl: env.WEB_URL,
    email: {
      from: env.EMAIL_FROM ?? null,
      resendApiKey: env.RESEND_API_KEY ?? null,
    },
    uploads: {
      maxBytes: env.MAX_UPLOAD_BYTES,
      dir: env.UPLOAD_DIR,
    },
  };
}
