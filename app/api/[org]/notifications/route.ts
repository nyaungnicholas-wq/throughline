import { getMemberContext } from "@/lib/authz";
import { getNotifications } from "@/lib/notifications";

export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await getMemberContext(org);
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const data = await getNotifications(ctx);
  return Response.json(data);
}
