import { describe, expect, it } from "vitest";
import { randomToken, sha256hex, signToken, verifySignedToken } from "@/lib/crypto";

describe("crypto helpers", () => {
  it("signs and verifies a token round-trip", () => {
    const t = signToken("user:123:org:abc");
    expect(verifySignedToken(t)).toBe("user:123:org:abc");
  });

  it("rejects tampered or garbage tokens", () => {
    const t = signToken("payload");
    expect(verifySignedToken(t.slice(0, -2) + "zz")).toBeNull();
    expect(verifySignedToken("garbage")).toBeNull();
    expect(verifySignedToken("no-dot-here")).toBeNull();
  });

  it("sha256hex is deterministic and collision-distinct", () => {
    expect(sha256hex("x")).toBe(sha256hex("x"));
    expect(sha256hex("x")).not.toBe(sha256hex("y"));
  });

  it("randomToken is URL-safe and unique", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
