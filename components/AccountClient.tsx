"use client";

import { Check, LogOut } from "lucide-react";
import { useState } from "react";
import { signOutEverywhereAction } from "@/lib/actions/auth";
import { updateProfileAction } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

export function AccountClient({ orgSlug, name, email }: { orgSlug: string; name: string | null; email: string }) {
  const [value, setValue] = useState(name ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await updateProfileAction(orgSlug, value);
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } else {
      setError(res.error ?? "Couldn't save.");
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account</h1>
        <p className="text-sm text-slate-500">How you appear to teammates across your workspaces.</p>
      </div>

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-1.5">
          <Label htmlFor="acct-name">Display name</Label>
          <Input id="acct-name" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Maya Chen" maxLength={80} autoComplete="name" />
          <p className="text-xs text-slate-400">Shown on tasks, comments, and shared boards. Without it, teammates only see your email.</p>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="acct-email">Email</Label>
          <Input id="acct-email" value={email} readOnly disabled className="text-slate-400" />
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex items-center gap-3">
          <Button type="submit" disabled={busy || !value.trim()}>
            {saved ? <Check size={15} /> : null} {saved ? "Saved" : busy ? "Saving…" : "Save name"}
          </Button>
        </div>
      </form>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Security</h2>
        <p className="mt-1 text-sm text-slate-500">Signed in on a device you no longer trust? End every session everywhere — you&apos;ll need a fresh sign-in link afterward.</p>
        <form action={signOutEverywhereAction} className="mt-4">
          <Button type="submit" variant="secondary" className="text-red-600">
            <LogOut size={15} /> Sign out of all devices
          </Button>
        </form>
      </div>
    </div>
  );
}
