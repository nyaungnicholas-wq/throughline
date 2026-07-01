"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestMagicLink, signOut, signOutEverywhere } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL;
  // Don't trust the Host header in production — a spoofed Host would point the
  // magic link at an attacker's domain. Require an explicit, pinned APP_URL.
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL must be set in production");
  }
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export type LinkState = { ok?: boolean; error?: string; devLink?: string; email?: string };

/** Form action (useActionState) for the login screen. */
export async function requestLinkAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0].trim() || hdrs.get("x-real-ip") || "unknown";
  if (!(await rateLimit(`login-ip:${ip}`, 10, 60_000))) {
    return { error: "Too many sign-in attempts. Please wait a minute and try again." };
  }
  const email = String(formData.get("email") ?? "");
  const res = await requestMagicLink(email, await baseUrl());
  if (!res.ok) return { error: res.error ?? "Something went wrong." };
  return { ok: true, devLink: res.devLink, email: email.trim().toLowerCase() };
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}

export async function signOutEverywhereAction() {
  await signOutEverywhere();
  redirect("/login");
}
