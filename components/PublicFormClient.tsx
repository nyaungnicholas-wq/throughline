"use client";

import { CheckCircle2, Sparkles } from "lucide-react";
import { useState } from "react";
import { submitFormAction } from "@/lib/actions/forms";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";

export function PublicFormClient({
  token,
  title,
  description,
  orgName,
}: {
  token: string;
  title: string;
  description: string | null;
  orgName: string;
}) {
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await submitFormAction(token, { summary, details, name, email });
    setBusy(false);
    if (r.ok) setDone(true);
    else setError(r.error ?? "Something went wrong.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center gap-2 text-slate-400">
          <Sparkles size={16} className="text-indigo-500" />
          <span className="text-sm font-medium">{orgName}</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          {done ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
                <CheckCircle2 size={26} />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Thanks — we got it!</h2>
              <p className="mt-1 text-sm text-slate-500">Your request was submitted to the {orgName} team.</p>
              <button onClick={() => { setDone(false); setSummary(""); setDetails(""); }} className="mt-5 text-sm font-medium text-indigo-600 hover:text-indigo-800">
                Submit another
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
              </div>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div>
                <Label htmlFor="s">Request *</Label>
                <Input id="s" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A short summary of what you need" required autoFocus />
              </div>
              <div>
                <Label htmlFor="d">Details</Label>
                <Textarea id="d" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Anything that helps us understand the request" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="n">Your name</Label>
                  <Input id="n" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="e">Email</Label>
                  <Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <Button type="submit" disabled={busy || summary.trim().length < 2} className="w-full justify-center">
                {busy ? "Submitting…" : "Submit request"}
              </Button>
            </form>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">Powered by Throughline</p>
      </div>
    </main>
  );
}
