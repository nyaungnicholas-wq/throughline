import { redirect } from "next/navigation";
import { listOrgsForUser, requireUser } from "@/lib/authz";

export default async function Home() {
  const user = await requireUser();
  const orgs = await listOrgsForUser(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  redirect(`/${orgs[0].org.slug}`);
}
