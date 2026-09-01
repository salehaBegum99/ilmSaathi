import { describe, expect, it } from "vitest";
import { sniffContentType } from "../src/core/file-signatures.js";

describe("sniffContentType", () => {
  it("recognizes a PDF by its magic bytes", () => {
    const buffer = Buffer.concat([Buffer.from("%PDF-1.7\n", "ascii"), Buffer.from([1, 2, 3])]);
    expect(sniffContentType(buffer)).toBe("application/pdf");
  });

  it("recognizes a PNG by its magic bytes", () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
    expect(sniffContentType(buffer)).toBe("image/png");
  });

  it("recognizes a JPEG by its magic bytes", () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(sniffContentType(buffer)).toBe("image/jpeg");
  });

  it("rejects a text file renamed with an image extension (extension/signature mismatch)", () => {
    const buffer = Buffer.from("just plain text pretending to be an image", "ascii");
    expect(sniffContentType(buffer)).toBeNull();
  });

  it("rejects an executable disguised with a PDF-like name", () => {
    // MZ header (Windows PE executable), not a real PDF, JPEG or PNG.
    const buffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
    expect(sniffContentType(buffer)).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(sniffContentType(Buffer.alloc(0))).toBeNull();
  });

  it("rejects a truncated signature shorter than the real one", () => {
    expect(sniffContentType(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
  });
});
