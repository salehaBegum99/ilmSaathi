import type { VerificationDocumentContentType } from "@learning-platform/shared";

const PDF_SIGNATURE = Buffer.from("%PDF-", "ascii");
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

// Sniffs the real file type from its magic bytes rather than trusting the client-declared
// Content-Type or filename extension, per docs/threat-model.md's "extension mismatch, bad
// signature" test requirement.
export function sniffContentType(buffer: Buffer): VerificationDocumentContentType | null {
  if (startsWith(buffer, PDF_SIGNATURE)) return "application/pdf";
  if (startsWith(buffer, PNG_SIGNATURE)) return "image/png";
  if (startsWith(buffer, JPEG_SIGNATURE)) return "image/jpeg";
  return null;
}
