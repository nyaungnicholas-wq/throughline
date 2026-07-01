import { getMemberContext } from "@/lib/authz";
import { loadBoardSnapshot } from "@/lib/board/snapshot";
import { serializeSnapshot } from "@/lib/board/serialize";
import { isUuid } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ org: string; boardId: string }> },
) {
  const { org, boardId } = await params;
  const ctx = await getMemberContext(org);
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(boardId)) return Response.json({ error: "not found" }, { status: 404 });

  const snap = await loadBoardSnapshot(ctx, boardId);
  if (!snap) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(serializeSnapshot(snap));
}
