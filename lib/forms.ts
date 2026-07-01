import { and, eq, isNull } from "drizzle-orm";
import { boards, forms, organizations, type Form } from "@/db/schema";
import { getDb } from "@/lib/db";

export type PublicForm = { form: Form; boardName: string; orgName: string };

/** Look up a live public form by its token (no auth — scoped by the token itself). */
export async function getPublicForm(token: string): Promise<PublicForm | null> {
  const db = await getDb();
  const [row] = await db
    .select({ form: forms, boardName: boards.name, orgName: organizations.name })
    .from(forms)
    .innerJoin(boards, eq(boards.id, forms.boardId))
    .innerJoin(organizations, eq(organizations.id, forms.orgId))
    .where(and(eq(forms.token, token), eq(forms.enabled, true), isNull(forms.deletedAt), isNull(boards.deletedAt), isNull(organizations.deletedAt)))
    .limit(1);
  return row ? { form: row.form, boardName: row.boardName, orgName: row.orgName } : null;
}
