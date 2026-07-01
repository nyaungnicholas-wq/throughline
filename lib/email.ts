/**
 * Email via Resend, env-gated. With no RESEND_API_KEY it's a safe no-op (logs in
 * dev) so nothing breaks; set the key and invites + notifications start sending.
 */
type SendArgs = { to: string; subject: string; text: string; html?: string };

export function emailLive(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(args: SendArgs): Promise<{ ok: boolean; skipped?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Throughline <onboarding@resend.dev>";
  if (!key) {
    if (process.env.NODE_ENV !== "production") console.log(`[email:dev no-op] → ${args.to} · "${args.subject}"`);
    return { ok: true, skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: args.to, subject: args.subject, text: args.text, ...(args.html ? { html: args.html } : {}) }),
    });
    if (!res.ok) {
      console.error(`[email] Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] send error", e);
    return { ok: false };
  }
}
