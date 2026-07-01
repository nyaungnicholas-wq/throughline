import { getMemberContext } from "@/lib/authz";
import { loadItemDetail } from "@/lib/board/item-detail";
import { isUuid } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ org: string; itemId: string }> },
) {
  const { org, itemId } = await params;
  const ctx = await getMemberContext(org);
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(itemId)) return Response.json({ error: "not found" }, { status: 404 });
  const detail = await loadItemDetail(ctx, itemId);
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(detail);
}
