import { and, eq, isNull } from "drizzle-orm";
import { attachments, membership, type Attachment } from "@/db/schema";
import { getDb } from "@/lib/db";

/** Fetch an attachment only if the user is a member of its org. Scoped at the query. */
export async function getAttachmentForUser(userId: string, id: string): Promise<Attachment | null> {
  const db = await getDb();
  const [row] = await db
    .select({ a: attachments })
    .from(attachments)
    .innerJoin(
      membership,
      and(
        eq(membership.orgId, attachments.orgId),
        eq(membership.userId, userId),
        isNull(membership.deletedAt),
      ),
    )
    .where(eq(attachments.id, id))
    .limit(1);
  return row?.a ?? null;
}
