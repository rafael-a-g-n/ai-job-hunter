import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NotFoundError } from "@/lib/errors";
import type { BlobStore } from "./blob-store";

/** Dev/test store: files under `.data/blobs/` (git-ignored). */
export class LocalBlobStore implements BlobStore {
  private readonly root: string;

  constructor(root = path.join(process.cwd(), ".data", "blobs")) {
    this.root = path.resolve(/*turbopackIgnore: true*/ root);
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Invalid blob key: ${key}`);
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new NotFoundError("File");
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
