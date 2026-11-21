import { del, get, put } from "@vercel/blob";
import { NotFoundError } from "@/lib/errors";
import type { BlobStore } from "./blob-store";

/**
 * Private blobs: never reachable by URL, only read back through our server.
 * Keys already carry a cuid, so no random suffix is added and the pathname stays predictable
 * for our own lookups.
 */
export class VercelBlobStore implements BlobStore {
  constructor(private readonly token: string) {}

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await put(key, data, {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: this.token,
    });
  }

  async get(key: string): Promise<Buffer> {
    const res = await get(key, { access: "private", token: this.token, useCache: false });
    if (!res || res.statusCode !== 200) throw new NotFoundError("File");
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await del(key, { token: this.token });
  }
}
