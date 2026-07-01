import dns from "node:dns/promises";
import net from "node:net";

function ipv4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const o of p) {
    const x = Number(o);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = (n << 8) | x;
  }
  return n >>> 0;
}

function inV4(ip: string, base: string, bits: number): boolean {
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(base);
  if (a === null || b === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

/** True for loopback / private / link-local / CGNAT / unspecified addresses. */
function isBlockedIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    // map IPv4-mapped IPv6 back to v4 and re-check
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return x === "::1" || x === "::" || x.startsWith("fe80") || x.startsWith("fc") || x.startsWith("fd");
  }
  return (
    inV4(ip, "0.0.0.0", 8) ||
    inV4(ip, "10.0.0.0", 8) ||
    inV4(ip, "127.0.0.0", 8) ||
    inV4(ip, "169.254.0.0", 16) ||
    inV4(ip, "172.16.0.0", 12) ||
    inV4(ip, "192.168.0.0", 16) ||
    inV4(ip, "100.64.0.0", 10)
  );
}

/**
 * SSRF guard for user-registered URLs (webhooks, Slack). Resolves the host and
 * blocks any internal/metadata target. Fails CLOSED (returns true) on parse or
 * DNS errors. Call at store time AND dispatch time (DNS rebinding defense).
 */
export async function isBlockedUrl(raw: string): Promise<boolean> {
  let host: string;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    host = u.hostname;
  } catch {
    return true;
  }
  if (!host) return true;
  if (host.toLowerCase() === "localhost") return true;
  if (net.isIP(host)) return isBlockedIp(host);
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (addrs.length === 0) return true;
    return addrs.some((a) => isBlockedIp(a.address));
  } catch {
    return true;
  }
}

/** Slack Incoming Webhooks are always on hooks.slack.com — allowlist eliminates the SSRF vector. */
export function isSlackWebhookHost(raw: string): boolean {
  try {
    return new URL(raw).hostname.toLowerCase() === "hooks.slack.com";
  } catch {
    return false;
  }
}
