import type { BoardSnapshot, ClientBoardSnapshot } from "@/lib/board/types";

/** Convert a server snapshot (Date objects) into the JSON-safe client shape (ISO strings). */
export function serializeSnapshot(snap: BoardSnapshot): ClientBoardSnapshot {
  return JSON.parse(JSON.stringify(snap)) as ClientBoardSnapshot;
}
