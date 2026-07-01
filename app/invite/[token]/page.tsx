import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { acceptInvite } from "@/lib/invites";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?error=${encodeURIComponent("Sign in, then open your invite link again.")}`);

  const res = await acceptInvite(user, token);
  if (res.ok) redirect(`/${res.slug}`);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Invite problem</h1>
        <p className="mt-2 text-sm text-slate-500">{res.error}</p>
        <Link href="/" className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Go to your workspaces
        </Link>
      </div>
    </main>
  );
}
