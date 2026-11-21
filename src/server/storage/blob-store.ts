import { env } from "@/lib/env";
import { LocalBlobStore } from "./local";
import { VercelBlobStore } from "./vercel-blob";

export interface BlobStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

let cached: BlobStore | undefined;

export function getBlobStore(): BlobStore {
  cached ??=
    env.STORAGE_PROVIDER === "vercel-blob"
      ? new VercelBlobStore(env.BLOB_READ_WRITE_TOKEN ?? "")
      : new LocalBlobStore();
  return cached;
}
