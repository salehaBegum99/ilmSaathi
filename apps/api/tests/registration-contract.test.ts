import { describe, expect, it } from "vitest";
import { registrationSchema } from "@learning-platform/shared";

const commonRegistration = {
  email: "learner@example.com",
  password: "A-safe-password-123",
  termsVersion: "2026-08-30",
  privacyVersion: "2026-08-30",
};

describe("registration contract", () => {
  it("allows learners to register without an age declaration", () => {
    const result = registrationSchema.safeParse({
      ...commonRegistration,
      role: "learner",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an age declaration on the strict learner payload", () => {
    const result = registrationSchema.safeParse({
      ...commonRegistration,
      role: "learner",
      age18Confirmed: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires adult confirmation from educators", () => {
    const missingConfirmation = registrationSchema.safeParse({
      ...commonRegistration,
      role: "educator",
    });
    const confirmed = registrationSchema.safeParse({
      ...commonRegistration,
      role: "educator",
      age18Confirmed: true,
    });

    expect(missingConfirmation.success).toBe(false);
    expect(confirmed.success).toBe(true);
  });
});
