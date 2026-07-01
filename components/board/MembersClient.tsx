"use client";

import { Check, Copy, Link2, Mail, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/db/schema";
import { changeRoleAction, createInviteAction, removeMemberAction, revokeInviteAction } from "@/lib/actions/members";
import type { SnapshotMember } from "@/lib/board/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { fmtDate } from "@/lib/time";

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", member: "Member" };

export type PendingInviteRow = { id: string; email: string | null; role: Role; createdAt: string; expiresAt: string };

export function MembersClient({
  orgSlug,
  members,
  invites,
  viewer,
}: {
  orgSlug: string;
  members: SnapshotMember[];
  invites: PendingInviteRow[];
  viewer: { id: string; role: Role };
}) {
  const router = useRouter();
  const isOwner = viewer.role === "owner";
  const isManager = viewer.role === "owner" || viewer.role === "manager";

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteRoles: Role[] = isOwner ? ["member", "manager", "owner"] : ["member", "manager"];

  async function makeInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createInviteAction(orgSlug, { email: email || undefined, role });
    setBusy(false);
    if (res.ok) {
      setLink(res.link);
      setCopied(false);
      setEmail("");
    } else setError(res.error);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Members</h1>
        <p className="text-sm text-slate-500">Manage who&apos;s in this workspace and what they can do.</p>
      </div>

      {isManager && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800"><UserPlus size={16} /> Invite people</h2>
          <form onSubmit={makeInvite} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Input type="email" placeholder="teammate@company.com (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-36">
              {inviteRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create invite link"}</Button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {!email && <p className="mt-2 text-xs text-slate-400">No email = a reusable open link (Member role only).</p>}
          {link && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-2">
              <code className="flex-1 truncate text-xs text-slate-600">{link}</code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
              </Button>
            </div>
          )}
        </div>
      )}

      {isManager && invites.length > 0 && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Pending invites</h2>
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                {inv.email ? <Mail size={15} /> : <Link2 size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{inv.email ?? "Open invite link"}</p>
                <p className="text-xs text-slate-400">{ROLE_LABEL[inv.role]} · expires {fmtDate(inv.expiresAt)}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                onClick={async () => {
                  await revokeInviteAction(orgSlug, inv.id);
                  router.refresh();
                }}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {members.map((m, i) => (
          <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-slate-100" : ""}`}>
            <Avatar name={m.name} email={m.email} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800">{m.name ?? m.email}{m.id === viewer.id && <span className="text-slate-400"> (you)</span>}</p>
              <p className="truncate text-xs text-slate-400">{m.email}</p>
            </div>
            {isOwner && m.id !== viewer.id ? (
              <Select
                value={m.role}
                onChange={async (e) => { await changeRoleAction(orgSlug, m.id, e.target.value as Role); router.refresh(); }}
                className="h-8 w-32 text-sm"
              >
                {(["member", "manager", "owner"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{ROLE_LABEL[m.role]}</span>
            )}
            {isManager && m.id !== viewer.id && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                onClick={async () => {
                  if (window.confirm(`Remove ${m.name ?? m.email} from the workspace?`)) {
                    const res = await removeMemberAction(orgSlug, m.id);
                    if (!res.ok) window.alert(res.error);
                    router.refresh();
                  }
                }}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
