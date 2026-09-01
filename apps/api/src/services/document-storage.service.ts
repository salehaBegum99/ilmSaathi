import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// apps/api/, regardless of process.cwd() at launch (which differs between `npm run dev`, a
// process manager, and this file's own ad-hoc smoke scripts) — anchoring a relative UPLOAD_DIR
// here keeps it predictable instead of depending on how the process happened to be started.
const API_PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export interface DocumentStorage {
  save(buffer: Buffer): Promise<{ objectKey: string }>;
  createReadStream(objectKey: string): ReadStream;
  delete(objectKey: string): Promise<void>;
}

export class LocalDocumentStorage implements DocumentStorage {
  private readonly rootDir: string;
  private ensured = false;

  constructor(dir: string) {
    this.rootDir = path.resolve(API_PACKAGE_ROOT, dir);
  }

  private resolvePath(objectKey: string): string {
    const resolved = path.resolve(this.rootDir, objectKey);
    // objectKey is always a value this class generated itself (never client input), but the
    // containment check is cheap defense in depth against any future misuse.
    if (resolved !== this.rootDir && !resolved.startsWith(this.rootDir + path.sep)) {
      throw new Error("Resolved document path escaped the upload directory");
    }
    return resolved;
  }

  private async ensureRootDir(): Promise<void> {
    if (this.ensured) return;
    await mkdir(this.rootDir, { recursive: true });
    this.ensured = true;
  }

  async save(buffer: Buffer): Promise<{ objectKey: string }> {
    await this.ensureRootDir();
    const objectKey = randomBytes(24).toString("base64url");
    await writeFile(this.resolvePath(objectKey), buffer, { mode: 0o600 });
    return { objectKey };
  }

  createReadStream(objectKey: string): ReadStream {
    return createReadStream(this.resolvePath(objectKey));
  }

  async delete(objectKey: string): Promise<void> {
    await rm(this.resolvePath(objectKey), { force: true });
  }
}
