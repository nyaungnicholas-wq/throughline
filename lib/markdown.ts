/** Tiny, SAFE markdown → HTML. HTML is escaped FIRST, so no raw markup can pass
    through; we then re-introduce a small whitelist (bold/italic/code/links/lists).
    Quotes are escaped too — otherwise a crafted link URL could break out of the
    href="…" attribute and inject a live event handler (stored XSS). */
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

export function renderMarkdown(src: string): string {
  let s = esc(src);
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // links — only http(s) destinations. The URL here is already HTML-escaped, so any
  // smuggled quote/angle-bracket shows up as an entity; reject those outright and
  // leave the (escaped) markdown as plain text rather than emit a suspicious href.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, text: string, url: string) => {
    if (/&quot;|&#39;|&lt;|&gt;/.test(url)) return m;
    return `<a href="${url}" target="_blank" rel="noreferrer noopener" class="text-indigo-600 underline">${text}</a>`;
  });

  const lines = s.split("\n");
  let out = "";
  let inList = false;
  for (const ln of lines) {
    const m = ln.match(/^\s*[-*]\s+(.*)$/);
    if (m) {
      if (!inList) {
        out += '<ul class="list-disc space-y-0.5 pl-5">';
        inList = true;
      }
      out += `<li>${m[1]}</li>`;
    } else {
      if (inList) {
        out += "</ul>";
        inList = false;
      }
      out += ln.trim() ? `<p>${ln}</p>` : "";
    }
  }
  if (inList) out += "</ul>";
  return out;
}
