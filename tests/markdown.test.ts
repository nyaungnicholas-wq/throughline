import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown — XSS safety", () => {
  it("escapes raw HTML so no markup passes through", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes double quotes so a link href cannot break out into an event handler", () => {
    // Attribute-breakout payload: a stray quote + onmouseover would, without quote
    // escaping, become a LIVE event handler attribute.
    const html = renderMarkdown('[x](https://t.co/a"/onmouseover="alert(document.cookie))');
    expect(html).not.toContain('onmouseover="alert');
    expect(html).not.toContain('"/onmouseover');
    // The suspicious link is rejected, not emitted as an anchor.
    expect(html).not.toContain("<a href=\"https://t.co/a\"");
  });

  it("does not emit javascript: or other non-http(s) schemes as links", () => {
    expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("<a ");
    expect(renderMarkdown("[x](data:text/html,<script>)")).not.toContain("<a ");
  });

  it("renders a normal https link with safe rel/target", () => {
    const html = renderMarkdown("see [docs](https://example.com/path?a=1&b=2)");
    expect(html).toContain('href="https://example.com/path?a=1&amp;b=2"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('target="_blank"');
  });

  it("still renders bold, italic, code, and lists", () => {
    expect(renderMarkdown("**b**")).toContain("<strong>b</strong>");
    expect(renderMarkdown("a *i* b")).toContain("<em>i</em>");
    expect(renderMarkdown("`code`")).toContain("<code");
    const list = renderMarkdown("- one\n- two");
    expect(list).toContain("<ul");
    expect(list).toContain("<li>one</li>");
    expect(list).toContain("<li>two</li>");
  });

  it("escapes quotes/apostrophes in plain text", () => {
    const html = renderMarkdown(`he said "hi" it's fine`);
    expect(html).toContain("&quot;hi&quot;");
    expect(html).toContain("it&#39;s");
  });
});
