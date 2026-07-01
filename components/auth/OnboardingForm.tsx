"use client";

import { ArrowRight } from "lucide-react";
import { useActionState } from "react";
import { createOrgAction, type CreateOrgState } from "@/lib/actions/org";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<CreateOrgState, FormData>(createOrgAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div>
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" name="name" placeholder="Acme Studio" required autoFocus />
        <p className="mt-1.5 text-xs text-slate-400">Your team, projects, and boards live here.</p>
      </div>
      <Button type="submit" disabled={pending} className="w-full justify-center">
        {pending ? "Creating…" : "Create workspace"}
        {!pending && <ArrowRight size={16} />}
      </Button>
    </form>
  );
}
