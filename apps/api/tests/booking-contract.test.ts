import { describe, expect, it } from "vitest";
import {
  bookingAcceptSchema,
  bookingCancelSchema,
  bookingCreateSchema,
  bookingDeclineSchema,
} from "@learning-platform/shared";

const validEducatorId = "507f1f77bcf86cd799439011";
const validSubjectId = "507f1f77bcf86cd799439012";

function isoInHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1_000).toISOString();
}

describe("booking create contract", () => {
  it("accepts a request at least one hour in the future", () => {
    const result = bookingCreateSchema.safeParse({
      educatorId: validEducatorId,
      subjectId: validSubjectId,
      startAt: isoInHours(2),
      timezone: "Asia/Kolkata",
      message: "Looking forward to my first lesson.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a request less than one hour from now", () => {
    const result = bookingCreateSchema.safeParse({
      educatorId: validEducatorId,
      subjectId: validSubjectId,
      startAt: isoInHours(0.25),
      timezone: "Asia/Kolkata",
      message: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a request for a time already in the past", () => {
    const result = bookingCreateSchema.safeParse({
      educatorId: validEducatorId,
      subjectId: validSubjectId,
      startAt: isoInHours(-2),
      timezone: "Asia/Kolkata",
      message: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown timezone", () => {
    const result = bookingCreateSchema.safeParse({
      educatorId: validEducatorId,
      subjectId: validSubjectId,
      startAt: isoInHours(2),
      timezone: "Not/ARealZone",
      message: "",
    });

    expect(result.success).toBe(false);
  });

  it("defaults an omitted message to an empty string", () => {
    const result = bookingCreateSchema.safeParse({
      educatorId: validEducatorId,
      subjectId: validSubjectId,
      startAt: isoInHours(2),
      timezone: "Asia/Kolkata",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.message).toBe("");
  });
});

describe("booking accept contract", () => {
  it("accepts a well-formed https meeting link", () => {
    const result = bookingAcceptSchema.safeParse({ meetingLink: "https://meet.example.com/abc" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-URL meeting link", () => {
    const result = bookingAcceptSchema.safeParse({ meetingLink: "not a link" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing meeting link", () => {
    const result = bookingAcceptSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("booking decline/cancel reason contract", () => {
  it("requires a real reason for a decline", () => {
    const tooShort = bookingDeclineSchema.safeParse({ reason: "no" });
    const ok = bookingDeclineSchema.safeParse({ reason: "This time no longer works for me." });

    expect(tooShort.success).toBe(false);
    expect(ok.success).toBe(true);
  });

  it("requires a real reason for a cancellation", () => {
    const tooShort = bookingCancelSchema.safeParse({ reason: "busy" });
    const ok = bookingCancelSchema.safeParse({ reason: "Something came up and I cannot attend." });

    expect(tooShort.success).toBe(false);
    expect(ok.success).toBe(true);
  });
});
