import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { StorageKeyError, deleteObject, getObject, putObject, storageBackend } from "@/lib/storage";

const orgId = randomUUID();
const key = `${orgId}/abc123-report.pdf`;

afterAll(async () => {
  await rm(path.join(process.cwd(), ".data", "uploads", orgId), { recursive: true, force: true });
});

describe("attachment storage (local filesystem backend)", () => {
  it("uses the local backend when no blob token is configured", () => {
    expect(process.env.BLOB_READ_WRITE_TOKEN ?? "").toBe("");
    expect(storageBackend()).toBe("local");
  });

  it("round-trips bytes through put → get", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 hello");
    await putObject(key, bytes, "application/pdf");
    expect(await getObject(key)).toEqual(bytes);
  });

  it("returns null for an object that isn't there", async () => {
    expect(await getObject(`${orgId}/missing-file.txt`)).toBeNull();
  });

  it("deletes, and deleting twice is not an error", async () => {
    await deleteObject(key);
    expect(await getObject(key)).toBeNull();
    await expect(deleteObject(key)).resolves.toBeUndefined();
  });

  it("rejects keys that could escape the uploads root", async () => {
    for (const bad of [`${orgId}/../../etc/passwd`, "../secrets", "/etc/passwd", "nested/deep/key", ""]) {
      await expect(putObject(bad, new Uint8Array(), "text/plain")).rejects.toBeInstanceOf(StorageKeyError);
      await expect(getObject(bad)).rejects.toBeInstanceOf(StorageKeyError);
    }
  });
});
