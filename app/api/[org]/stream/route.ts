import { getMemberContext } from "@/lib/authz";
import { subscribe } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getMemberContext(org);
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const orgId = ctx.org.id;

  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: string) => {
        try {
          controller.enqueue(enc.encode(`data: ${data}\n\n`));
        } catch {
          cleanup();
        }
      };
      send(JSON.stringify({ kind: "hello" }));
      const unsub = subscribe(orgId, send);
      const hb = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: heartbeat\n\n`));
        } catch {
          cleanup();
        }
      }, 25_000);
      cleanup = () => {
        clearInterval(hb);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
