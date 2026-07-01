"use client";

import { useEffect, useRef } from "react";

/** Subscribe to the org's SSE stream and run `onEvent` on each live event. */
export function useOrgStream(orgSlug: string, onEvent: (data: { kind: string; [k: string]: unknown }) => void) {
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/${orgSlug}/stream`);
    } catch {
      return;
    }
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d && d.kind && d.kind !== "hello") cb.current(d);
      } catch {
        /* ignore malformed frames */
      }
    };
    es.onerror = () => {
      /* EventSource auto-reconnects; nothing to do */
    };
    return () => es?.close();
  }, [orgSlug]);
}
