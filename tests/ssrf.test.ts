import { describe, expect, it } from "vitest";
import { isBlockedUrl, isSlackWebhookHost } from "@/lib/ssrf-guard";

describe("SSRF guard", () => {
  it("blocks loopback, private and metadata addresses", async () => {
    for (const u of [
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://192.168.1.5/",
      "http://172.16.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:5432/",
    ]) {
      expect(await isBlockedUrl(u), u).toBe(true);
    }
  });

  it("allows a public IP", async () => {
    expect(await isBlockedUrl("http://8.8.8.8/")).toBe(false);
  });

  it("rejects non-http(s) schemes and garbage", async () => {
    expect(await isBlockedUrl("file:///etc/passwd")).toBe(true);
    expect(await isBlockedUrl("not a url")).toBe(true);
  });

  it("Slack allowlist only accepts hooks.slack.com", () => {
    expect(isSlackWebhookHost("https://hooks.slack.com/services/x")).toBe(true);
    expect(isSlackWebhookHost("https://evil.example.com/")).toBe(false);
  });
});
