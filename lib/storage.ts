import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Object storage for attachments, with two interchangeable backends chosen at runtime:
 *
 *   - **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set. Required on Vercel, whose
 *     filesystem is read-only and per-invocation ephemeral.
 *   - **Local filesystem** under `.data/uploads` otherwise, so `npm run dev` needs no
 *     configuration at all.
 *
 * Only the storage *key* is ever persisted (see `attachment.storage_key`). Nothing here
 * hands out a URL to a caller — every download still goes through the membership-checked
 * proxy at `/api/attachments/[id]`.
 */

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

/** `<orgUuid>/<random>-<sanitised filename>`. Anything else is rejected before it can
    reach the filesystem, so a tampered DB row can't escape the uploads root. */
const KEY_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,128}$/i;

export class StorageKeyError extends Error {}

function assertKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..")) throw new StorageKeyError(`Invalid storage key: ${key}`);
}

function blobToken(): string | undefined {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  return t && t.length > 0 ? t : undefined;
}

type BlobModule = {
  put(key: string, body: Uint8Array, opts: Record<string, unknown>): Promise<{ pathname: string }>;
  head(key: string, opts: Record<string, unknown>): Promise<{ url: string }>;
  del(key: string, opts: Record<string, unknown>): Promise<void>;
};

/* `@vercel/blob` is an OPTIONAL dependency — the app must build and run without it
   installed. A literal `import("@vercel/blob")` would be statically resolved by the
   bundler and fail the build when the package is absent, so the specifier is hidden
   behind a runtime-constructed import. */
const runtimeImport = new Function("s", "return import(s)") as (s: string) => Promise<unknown>;

async function blob(): Promise<BlobModule> {
  try {
    return (await runtimeImport("@vercel/blob")) as BlobModule;
  } catch {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is set but @vercel/blob is not installed. Run `npm install @vercel/blob`.",
    );
  }
}

/** Which backend is active. Useful for diagnostics and tests. */
export function storageBackend(): "vercel-blob" | "local" {
  return blobToken() ? "vercel-blob" : "local";
}

export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  assertKey(key);
  const token = blobToken();
  if (token) {
    const { put } = await blob();
    /* `access: "public"` is currently the only mode Vercel Blob offers. The key carries
       128 bits of randomness so the raw blob URL is unguessable, and the URL is never
       stored or returned to a client — reads go through the authorised proxy route. */
    await put(key, bytes, { access: "public", addRandomSuffix: false, contentType, token });
    return;
  }
  const dest = path.join(LOCAL_ROOT, key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, bytes);
}

/** Read an object back. Returns null when it no longer exists. */
export async function getObject(key: string): Promise<Uint8Array<ArrayBuffer> | null> {
  assertKey(key);
  const token = blobToken();
  if (token) {
    try {
      const { head } = await blob();
      const { url } = await head(key, { token });
      const res = await fetch(url);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  try {
    return new Uint8Array(await readFile(path.join(LOCAL_ROOT, key)));
  } catch {
    return null;
  }
}

/** Best-effort delete; a missing object is not an error. */
export async function deleteObject(key: string): Promise<void> {
  assertKey(key);
  const token = blobToken();
  if (token) {
    const { del } = await blob();
    await del(key, { token }).catch(() => {});
    return;
  }
  await unlink(path.join(LOCAL_ROOT, key)).catch(() => {});
}
