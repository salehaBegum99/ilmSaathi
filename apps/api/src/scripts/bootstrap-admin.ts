import { z } from "zod";
import { emailSchema, passwordSchema } from "@learning-platform/shared";
import { loadConfig } from "../config/env.js";
import {
  createTotpUri,
  encryptMfaSecret,
  generateTotpSecret,
  hashPassword,
} from "../core/security.js";
import { MongoConnectionManager } from "../database/connection.js";
import { UserRepository } from "../repositories/index.js";

const bootstrapSchema = z.object({
  ALLOW_ADMIN_BOOTSTRAP: z.literal("true"),
  BOOTSTRAP_ADMIN_EMAIL: emailSchema,
  BOOTSTRAP_ADMIN_PASSWORD: passwordSchema,
});

async function bootstrapAdmin() {
  const config = loadConfig();
  const input = bootstrapSchema.parse(process.env);
  const mongo = new MongoConnectionManager(config.mongo);
  await mongo.connect();
  try {
    const users = new UserRepository();
    if (await users.findByEmail(input.BOOTSTRAP_ADMIN_EMAIL)) {
      throw new Error("An account already exists for BOOTSTRAP_ADMIN_EMAIL; no changes were made");
    }
    const secret = generateTotpSecret();
    await users.createAdmin({
      email: input.BOOTSTRAP_ADMIN_EMAIL,
      passwordHash: await hashPassword(
        input.BOOTSTRAP_ADMIN_PASSWORD,
        config.auth.bcryptRounds,
      ),
      encryptedTotpSecret: encryptMfaSecret(secret, config.mfa.encryptionKey),
    });
    console.info("admin_bootstrap_complete");
    console.info("Enroll the following TOTP URI now; it will not be stored in plaintext again:");
    console.info(createTotpUri(secret, config.mfa.issuer, input.BOOTSTRAP_ADMIN_EMAIL));
  } finally {
    await mongo.disconnect();
  }
}

bootstrapAdmin().catch((error: unknown) => {
  console.error("admin_bootstrap_failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown bootstrap failure",
  });
  process.exitCode = 1;
});
