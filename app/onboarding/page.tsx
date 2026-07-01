import { Sparkles } from "lucide-react";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { signOutAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/authz";

export default async function OnboardingPage() {
  const user = await requireUser();
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
          <h1 className="mb-1 text-lg font-semibold text-slate-900">Create your workspace</h1>
          <p className="mb-5 text-sm text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{user.email}</span>.
          </p>
          <OnboardingForm />
        </div>
        <form action={signOutAction} className="mt-3 text-center">
          <button className="text-xs text-slate-400 hover:text-slate-600">Sign out</button>
        </form>
      </div>
    </main>
  );
}
