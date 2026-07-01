"use client";

import { Check, Copy, KeyRound, Slack, Trash2, Webhook } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createApiKeyAction, revokeApiKeyAction, type ClientApiKey } from "@/lib/actions/api-keys";
import { renameOrgAction, setSlackWebhookAction } from "@/lib/actions/org";
import { createWebhookAction, deleteWebhookAction, type ClientWebhook } from "@/lib/actions/webhooks";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { fmtDate } from "@/lib/time";

function Section({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
        <div>
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-400">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Reveal({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2.5">
      <p className="mb-1 text-xs font-semibold text-green-800">{label} — copy it now, it won&apos;t be shown again:</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate text-xs text-slate-700">{value}</code>
        <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(value); setCopied(true); }}>
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
        </Button>
      </div>
    </div>
  );
}

export function SettingsClient({
  orgSlug,
  orgName,
  slackUrl,
  apiKeys,
  webhooks,
}: {
  orgSlug: string;
  orgName: string;
  slackUrl: string;
  apiKeys: ClientApiKey[];
  webhooks: ClientWebhook[];
}) {
  const router = useRouter();
  const [name, setName] = useState(orgName);
  const [slack, setSlack] = useState(slackUrl);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>

      <Section icon={<span className="text-sm font-bold">Aa</span>} title="Workspace" desc="Name shown to your team">
        <div className="flex items-end gap-2">
          <div className="flex-1"><Label>Workspace name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button onClick={async () => { await renameOrgAction(orgSlug, name); router.refresh(); }}>Save</Button>
        </div>
      </Section>

      <Section icon={<Slack size={16} />} title="Slack" desc="Mirror activity to a Slack channel via an Incoming Webhook">
        <div className="flex items-end gap-2">
          <div className="flex-1"><Label>Incoming Webhook URL</Label><Input value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="https://hooks.slack.com/services/…" /></div>
          <Button onClick={async () => { const r = await setSlackWebhookAction(orgSlug, slack); setMsg(r.ok ? "Slack saved." : r.error ?? null); router.refresh(); }}>Save</Button>
        </div>
        {msg && <p className="mt-1 text-xs text-slate-500">{msg}</p>}
      </Section>

      <Section icon={<KeyRound size={16} />} title="API keys" desc="Authenticate the public REST API (Bearer token)">
        <div className="mb-3 flex items-end gap-2">
          <div className="flex-1"><Label>New key name</Label><Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="CI pipeline" /></div>
          <Button onClick={async () => { const r = await createApiKeyAction(orgSlug, keyName); if (r.ok && r.key) { setNewKey(r.key); setKeyName(""); router.refresh(); } }}>Create</Button>
        </div>
        {newKey && <Reveal label="Your new API key" value={newKey} />}
        <div className="mt-2 space-y-1.5">
          {apiKeys.length === 0 && <p className="text-sm text-slate-400">No keys yet.</p>}
          {apiKeys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <code className="text-slate-500">{k.prefix}…</code>
              <span className="flex-1 truncate text-slate-700">{k.name}</span>
              <span className="text-xs text-slate-400">{k.lastUsedAt ? `used ${fmtDate(k.lastUsedAt)}` : "never used"}</span>
              <button onClick={async () => { await revokeApiKeyAction(orgSlug, k.id); router.refresh(); }} className="text-xs text-red-600 hover:underline">Revoke</button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">Use: <code>curl -H &quot;Authorization: Bearer tl_…&quot; {`<host>`}/api/v1/boards</code></p>
      </Section>

      <Section icon={<Webhook size={16} />} title="Webhooks" desc="POST signed events to your endpoint on every activity">
        <div className="mb-3 flex items-end gap-2">
          <div className="flex-1"><Label>Endpoint URL</Label><Input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://example.com/hooks/throughline" /></div>
          <Button onClick={async () => { const r = await createWebhookAction(orgSlug, hookUrl); if (r.ok && r.secret) { setNewSecret(r.secret); setHookUrl(""); router.refresh(); } else setMsg(r.error ?? null); }}>Add</Button>
        </div>
        {newSecret && <Reveal label="Signing secret (verify the X-Throughline-Signature header)" value={newSecret} />}
        <div className="mt-2 space-y-1.5">
          {webhooks.length === 0 && <p className="text-sm text-slate-400">No webhooks yet.</p>}
          {webhooks.map((w) => (
            <div key={w.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <span className="flex-1 truncate text-slate-700">{w.url}</span>
              <button onClick={async () => { await deleteWebhookAction(orgSlug, w.id); router.refresh(); }} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
