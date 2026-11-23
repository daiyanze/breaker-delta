/** The Blobs port on Cloudflare R2. */
import type { Blobs } from "@bd/ports";

export function r2Blobs(bucket: R2Bucket): Blobs {
  return {
    async get(key) {
      const object = await bucket.get(key);
      return object === null ? null : new Uint8Array(await object.arrayBuffer());
    },
    async put(key, body, contentType) {
      await bucket.put(key, body, contentType ? { httpMetadata: { contentType } } : undefined);
    },
    async delete(key) {
      await bucket.delete(key);
    },
    async list(prefix) {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
        for (const object of page.objects) keys.push(object.key);
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return keys.sort();
    },
  };
}
