import { describe, expect, it } from "vitest";
import {
  blockCreateSchema,
  reportCreateSchema,
  reportDismissSchema,
  reportResolveSchema,
} from "@learning-platform/shared";

const validUserId = "507f1f77bcf86cd799439011";

describe("report create contract", () => {
  it("accepts a well-formed report", () => {
    const result = reportCreateSchema.safeParse({
      reportedUserId: validUserId,
      category: "safety_concern",
      description: "They asked me to move the conversation off-platform.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an optional relatedBookingId", () => {
    const result = reportCreateSchema.safeParse({
      reportedUserId: validUserId,
      category: "harassment",
      description: "Made me uncomfortable during the scheduled class.",
      relatedBookingId: "507f1f77bcf86cd799439012",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown category", () => {
    const result = reportCreateSchema.safeParse({
      reportedUserId: validUserId,
      category: "spam",
      description: "This is a long enough description to pass the length check.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a description that is too short", () => {
    const result = reportCreateSchema.safeParse({
      reportedUserId: validUserId,
      category: "other",
      description: "too short",
    });
    expect(result.success).toBe(false);
  });
});

describe("report resolve/dismiss contract", () => {
  it("requires a real reason to resolve", () => {
    const tooShort = reportResolveSchema.safeParse({ reason: "ok" });
    const ok = reportResolveSchema.safeParse({ reason: "Verified the concern and warned the user." });
    expect(tooShort.success).toBe(false);
    expect(ok.success).toBe(true);
  });

  it("defaults suspendUser to false", () => {
    const result = reportResolveSchema.safeParse({ reason: "Verified the concern and warned the user." });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.suspendUser).toBe(false);
  });

  it("requires a real reason to dismiss", () => {
    const tooShort = reportDismissSchema.safeParse({ reason: "no" });
    const ok = reportDismissSchema.safeParse({ reason: "No policy violation found after review." });
    expect(tooShort.success).toBe(false);
    expect(ok.success).toBe(true);
  });
});

describe("block create contract", () => {
  it("accepts a valid target user id", () => {
    const result = blockCreateSchema.safeParse({ blockedUserId: validUserId });
    expect(result.success).toBe(true);
  });

  it("rejects a non-ObjectId target", () => {
    const result = blockCreateSchema.safeParse({ blockedUserId: "not-an-id" });
    expect(result.success).toBe(false);
  });
});
