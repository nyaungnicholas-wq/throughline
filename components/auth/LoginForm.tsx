"use client";

import { CheckCircle2, Mail } from "lucide-react";
import { useActionState } from "react";
import { requestLinkAction, type LinkState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function LoginForm({ error }: { error?: string }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(requestLinkAction, {});

  if (state.ok) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
          <CheckCircle2 size={26} />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Check your inbox</h2>
        <p className="mt-1 text-sm text-slate-500">
          We sent a sign-in link to <span className="font-medium text-slate-700">{state.email}</span>.
        </p>
        {state.devLink && (
          <a
            href={state.devLink}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Dev: open magic link →
          </a>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <Input name="email" type="email" placeholder="you@company.com" required autoFocus />
      <Button type="submit" disabled={pending} className="w-full justify-center">
        <Mail size={16} />
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
