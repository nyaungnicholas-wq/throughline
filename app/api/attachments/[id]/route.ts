import { getCurrentUser } from "@/lib/auth";
import { getAttachmentForUser } from "@/lib/attachments";
import { isUuid } from "@/lib/db";
import { getObject } from "@/lib/storage";

/** Checked file proxy — never serves a guessable public URL; verifies org membership. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const a = await getAttachmentForUser(user.id, id);
  if (!a) return new Response("Not found", { status: 404 });

  try {
    // Local filesystem or Vercel Blob, depending on BLOB_READ_WRITE_TOKEN — see lib/storage.
    const buf = await getObject(a.storageKey);
    if (!buf) return new Response("File missing", { status: 404 });
    // The stored MIME type is client-supplied. Only an explicit allowlist of NON-scriptable
    // types may render inline. SVG is deliberately excluded — it is an active document that
    // executes embedded <script> when served inline (stored XSS), and `image/*.startsWith`
    // would otherwise let it through. Everything else is forced to download with a neutral
    // content type so the browser never executes it.
    const INLINE_SAFE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);
    const inlineOk = INLINE_SAFE.has(a.mimeType);
    return new Response(new Blob([buf]), {
      headers: {
        "Content-Type": inlineOk ? a.mimeType : "application/octet-stream",
        "Content-Disposition": `${inlineOk ? "inline" : "attachment"}; filename="${encodeURIComponent(a.filename)}"`,
        "Cache-Control": "private, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("File missing", { status: 404 });
  }
}
