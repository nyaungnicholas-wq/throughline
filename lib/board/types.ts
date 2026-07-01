import type {
  Board,
  BoardColumn,
  ColumnLabel,
  Item,
  ItemValue,
} from "@/db/schema";

/** A member of the org, as surfaced to the UI (no sensitive fields). */
export type SnapshotMember = {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "manager" | "member";
};

export type SnapshotColumn = BoardColumn & { labels: ColumnLabel[] };

/** An item plus its flexible-column cell values, keyed by columnId for O(1) lookup. */
export type SnapshotItem = Item & {
  values: Record<string, ItemValue>;
  assignee: SnapshotMember | null;
};

/** Everything one board needs, loaded in a single pass. All views project from this. */
export type BoardSnapshot = {
  board: Board;
  columns: SnapshotColumn[];
  items: SnapshotItem[];
  members: SnapshotMember[];
  /** The viewer's role + id, so the UI can gate actions client-side (server re-checks). */
  viewer: { id: string; role: "owner" | "manager" | "member" };
  /** The board's lead — they can delegate/approve here regardless of org role. */
  boardOwnerId: string | null;
  /** True when the board has more items than the snapshot cap — UI shows a "filter to see
      the rest" hint so views stay fast on very large boards. */
  truncated: boolean;
};

/** A row in the "My Work" queue — an assigned item with its board context. */
export type MyWorkItem = Item & { boardName: string; boardId: string };

/* ── Client-facing shapes (dates as ISO strings, since JSON has no Date) ──
   Both the board page (initialData) and the snapshot API route serialize through
   `serializeSnapshot`, so the client only ever sees these string-dated types. */
// Distributes over unions, so `Date | null` → `string | null` while non-date fields stay intact.
type DS<V> = V extends Date ? string : V;
type DateToString<T> = { [K in keyof T]: DS<T[K]> };

export type ClientItemValue = DateToString<ItemValue>;
export type ClientColumn = DateToString<BoardColumn> & { labels: ColumnLabel[] };
export type ClientItem = DateToString<Item> & {
  values: Record<string, ClientItemValue>;
  assignee: SnapshotMember | null;
};
export type ClientBoardSnapshot = {
  board: DateToString<Board>;
  columns: ClientColumn[];
  items: ClientItem[];
  members: SnapshotMember[];
  viewer: { id: string; role: "owner" | "manager" | "member" };
  boardOwnerId: string | null;
  truncated: boolean;
};
