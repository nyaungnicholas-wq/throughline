/**
 * Tiny in-process pub/sub for live updates, keyed by orgId. Survives HMR via
 * globalThis. Works for a single Node process (dev, or a single long-running
 * server). For multi-instance/serverless prod you'd swap this for Redis/Postgres
 * LISTEN-NOTIFY — the publish()/subscribe() surface stays the same.
 */
type Listener = (payload: string) => void;

const g = globalThis as unknown as { __tlBus?: Map<string, Set<Listener>> };
const bus: Map<string, Set<Listener>> = g.__tlBus ?? (g.__tlBus = new Map());

export function subscribe(orgId: string, cb: Listener): () => void {
  const set = bus.get(orgId) ?? new Set<Listener>();
  set.add(cb);
  bus.set(orgId, set);
  return () => {
    set.delete(cb);
    if (set.size === 0) bus.delete(orgId);
  };
}

export function publish(orgId: string, data: Record<string, unknown>): void {
  const set = bus.get(orgId);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(data);
  for (const cb of set) {
    try {
      cb(payload);
    } catch {
      /* a dead listener shouldn't break the rest */
    }
  }
}
