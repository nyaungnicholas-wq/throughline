import { Sparkles } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { Button } from "@/components/ui/button";
import { devLoginAction, seedDemoAction } from "@/lib/actions/dev";

const DEMO_ACCOUNTS: Array<{ email: string; label: string; role: string }> = [
  { email: "manager@acme.test", label: "Maya Manager", role: "Owner · Acme" },
  { email: "reviewer@acme.test", label: "Riley Reviewer", role: "Manager · Acme" },
  { email: "dev@acme.test", label: "Devin Dev", role: "Member · Acme" },
  { email: "owner@globex.test", label: "Gloria Globex", role: "Owner · Globex" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; seeded?: string }>;
}) {
  const { error, seeded } = await searchParams;
  const isDev = process.env.NODE_ENV === "development";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Sparkles size={18} />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">Throughline</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-slate-900">Sign in</h1>
          <p className="mb-5 text-sm text-slate-500">Delegate work, track it, approve it.</p>
          <LoginForm error={error} />
        </div>

        {isDev && (
          <div className="mt-4 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Dev demo {seeded ? "· loaded ✓" : ""}
            </p>
            <form action={seedDemoAction} className="mb-3">
              <Button type="submit" variant="subtle" size="sm" className="w-full justify-center">
                Load demo data (2 orgs, 6 tasks)
              </Button>
            </form>
            <div className="grid grid-cols-1 gap-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <form key={a.email} action={devLoginAction.bind(null, a.email)}>
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300"
                  >
                    <span className="font-medium text-slate-800">{a.label}</span>
                    <span className="text-xs text-slate-400">{a.role}</span>
                  </button>
                </form>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-400">
              One-click sign-in for local testing only. Log in as Devin to do the work, then as Maya/Riley to approve it.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
