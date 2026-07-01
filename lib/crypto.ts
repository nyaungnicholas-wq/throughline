import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "throughline-dev-secret-do-not-use-in-production";

export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET must be set in production");
  }
  return DEV_SECRET;
}

export function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Random, URL-safe, non-guessable token for magic links / invites / sessions. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time compare of two hex/string tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/* Stateless signed token: "base64url(payload).hmac". Tamper-evident, no DB row. */
export function signToken(payload: string): string {
  const sig = createHmac("sha256", appSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
}

export function verifySignedToken(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", appSecret()).update(payload).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  return payload;
}
