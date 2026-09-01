import { describe, expect, it } from "vitest";
import {
  deriveDocumentAccessSecret,
  signDocumentAccessToken,
  verifyDocumentAccessToken,
} from "../src/core/security.js";

const secret = deriveDocumentAccessSecret("a".repeat(32));
const documentId = "6a9400138b954576bf724fe2";
const otherDocumentId = "6a9400138b954576bf724fe3";

describe("document access token", () => {
  it("accepts a fresh, correctly-signed token for the right document", () => {
    const token = signDocumentAccessToken(documentId, secret, new Date(Date.now() + 5 * 60_000));
    expect(verifyDocumentAccessToken(token, documentId, secret)).toBe(true);
  });

  it("rejects an expired token", () => {
    const token = signDocumentAccessToken(documentId, secret, new Date(Date.now() - 1_000));
    expect(verifyDocumentAccessToken(token, documentId, secret)).toBe(false);
  });

  it("rejects a token issued for a different document", () => {
    const token = signDocumentAccessToken(documentId, secret, new Date(Date.now() + 5 * 60_000));
    expect(verifyDocumentAccessToken(token, otherDocumentId, secret)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = signDocumentAccessToken(documentId, secret, new Date(Date.now() + 5 * 60_000));
    const [id, expiresAt] = token.split(".");
    const tampered = `${id}.${expiresAt}.not-the-real-signature`;
    expect(verifyDocumentAccessToken(tampered, documentId, secret)).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signDocumentAccessToken(documentId, secret, new Date(Date.now() + 5 * 60_000));
    const otherSecret = deriveDocumentAccessSecret("b".repeat(32));
    expect(verifyDocumentAccessToken(token, documentId, otherSecret)).toBe(false);
  });

  it("rejects a malformed token", () => {
    expect(verifyDocumentAccessToken("not-a-real-token", documentId, secret)).toBe(false);
  });
});
