"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, GanttChartSquare, KanbanSquare, MoreHorizontal, Sparkles, Table2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ClientBoardSnapshot } from "@/lib/board/types";
import { aiSummarizeBoardAction } from "@/lib/actions/ai";
import { deleteBoardAction, renameBoardAction } from "@/lib/actions/boards";
import { applyControls, DEFAULT_CONTROLS, groupItems, type BoardControls as Controls } from "@/lib/board/filtering";
import { Drawer, Modal } from "@/components/ui/overlay";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/misc";
import { useOrgStream } from "@/components/shell/useOrgStream";
import { AutomationsButton } from "@/components/board/AutomationsButton";
import { BoardControls } from "@/components/board/BoardControls";
import { BoardOwnerControl } from "@/components/board/BoardOwnerControl";
import { BulkBar } from "@/components/board/BulkBar";
import { FormsButton } from "@/components/board/FormsButton";
import { ShareBoardButton } from "@/components/board/ShareBoardButton";
import { ImportButton } from "@/components/board/ImportButton";
import { CalendarView } from "@/components/board/CalendarView";
import { ItemDrawer } from "@/components/board/ItemDrawer";
import { KanbanView } from "@/components/board/KanbanView";
import { TableView } from "@/components/board/TableView";
import { TimelineView } from "@/components/board/TimelineView";
import { cn } from "@/lib/cn";

type ViewMode = "table" | "kanban" | "calendar" | "timeline";

const TABS: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
  { id: "table", label: "Table", icon: <Table2 size={15} /> },
  { id: "kanban", label: "Kanban", icon: <KanbanSquare size={15} /> },
  { id: "calendar", label: "Calendar", icon: <Calendar size={15} /> },
  { id: "timeline", label: "Timeline", icon: <GanttChartSquare size={15} /> },
];

export function BoardWorkspace({
  orgSlug,
  initial,
  initialOpen,
  boards,
}: {
  orgSlug: string;
  initial: ClientBoardSnapshot;
  initialOpen?: string | null;
  boards: { id: string; name: string }[];
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const boardId = initial.board.id;
  const [view, setView] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<string | null>(initialOpen ?? null);
  const [sumOpen, setSumOpen] = useState(false);
  const [sumBusy, setSumBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) =>
    setSelectedRows((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (ids: string[], checked: boolean) =>
    setSelectedRows((s) => { const n = new Set(s); ids.forEach((i) => (checked ? n.add(i) : n.delete(i))); return n; });
  const clearSelection = () => setSelectedRows(new Set());
  const switchView = (v: ViewMode) => { setView(v); clearSelection(); };

  async function summarizeBoard() {
    setSumOpen(true);
    setSumBusy(true);
    setSummary(null);
    const res = await aiSummarizeBoardAction(orgSlug, boardId);
    setSumBusy(false);
    setSummary(res.ok ? res.summary ?? "" : `⚠️ ${res.error}`);
  }

  const { data, isFetching } = useQuery<ClientBoardSnapshot>({
    queryKey: ["board", orgSlug, boardId],
    queryFn: async () => {
      const res = await fetch(`/api/${orgSlug}/boards/${boardId}/snapshot`, { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    initialData: initial,
    refetchInterval: 15_000,
  });

  const snapshot = data ?? initial;
  const onChanged = () => qc.invalidateQueries({ queryKey: ["board", orgSlug, boardId] });
  useOrgStream(orgSlug, onChanged);
  const isManager = snapshot.viewer.role !== "member";

  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS);
  const processed = useMemo(() => applyControls(snapshot.items, controls), [snapshot.items, controls]);
  const viewSnapshot = useMemo(() => ({ ...snapshot, items: processed }), [snapshot, processed]);
  const groups = useMemo(() => groupItems(processed, controls.group, snapshot.members), [processed, controls.group, snapshot.members]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">{snapshot.board.name}</h1>
          <BoardOwnerControl
            orgSlug={orgSlug}
            boardId={boardId}
            ownerId={snapshot.boardOwnerId}
            members={snapshot.members}
            canManage={isManager || snapshot.viewer.id === snapshot.boardOwnerId}
            onChanged={() => { onChanged(); router.refresh(); }}
          />
          {isFetching && <Spinner size={14} />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={summarizeBoard}
            className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            title="AI summary of this board"
          >
            <Sparkles size={15} /> Summarize
          </button>
          {isManager && <AutomationsButton orgSlug={orgSlug} boardId={boardId} members={snapshot.members} />}
          {isManager && <ImportButton orgSlug={orgSlug} boardId={boardId} onDone={onChanged} />}
          {isManager && <FormsButton orgSlug={orgSlug} boardId={boardId} />}
          {isManager && <ShareBoardButton orgSlug={orgSlug} boardId={boardId} initialToken={snapshot.board.shareToken} />}
          <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => switchView(t.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  view === t.id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          {isManager && (
            <Menu
              align="right"
              trigger={({ toggle }) => (
                <button onClick={toggle} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Board menu">
                  <MoreHorizontal size={18} />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem as="a" href={`/api/${orgSlug}/boards/${boardId}/export`} download onClick={close}>
                    Export to CSV
                  </MenuItem>
                  <div className="my-1 border-t border-slate-100" />
                  <MenuItem
                    onClick={async () => {
                      close();
                      const name = window.prompt("Rename board", snapshot.board.name);
                      if (name && name.trim()) {
                        await renameBoardAction(orgSlug, boardId, name);
                        onChanged();
                        router.refresh();
                      }
                    }}
                  >
                    Rename board
                  </MenuItem>
                  <MenuItem
                    className="text-red-600 hover:bg-red-50"
                    onClick={async () => {
                      close();
                      if (window.confirm(`Delete "${snapshot.board.name}"? This can't be undone.`)) {
                        await deleteBoardAction(orgSlug, boardId);
                        router.push(`/${orgSlug}`);
                        router.refresh();
                      }
                    }}
                  >
                    <Trash2 size={14} /> Delete board
                  </MenuItem>
                </>
              )}
            </Menu>
          )}
        </div>
      </div>

      <BoardControls controls={controls} setControls={setControls} members={snapshot.members} orgSlug={orgSlug} boardId={boardId} />

      {snapshot.truncated && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs font-medium text-amber-800">
          Showing the first 1,000 tasks on this board. Use search or filters to narrow down the rest.
        </div>
      )}

      <div className="min-h-0 flex-1">
        {view === "table" && (
          <TableView
            orgSlug={orgSlug}
            snapshot={snapshot}
            groups={groups}
            selected={selectedRows}
            onToggle={toggleSelect}
            onToggleAll={toggleAll}
            onOpenItem={setSelected}
            onChanged={onChanged}
          />
        )}
        {view === "kanban" && <KanbanView orgSlug={orgSlug} snapshot={viewSnapshot} onOpenItem={setSelected} onChanged={onChanged} />}
        {view === "calendar" && <CalendarView snapshot={viewSnapshot} onOpenItem={setSelected} />}
        {view === "timeline" && <TimelineView snapshot={viewSnapshot} onOpenItem={setSelected} />}
      </div>

      <Drawer open={selected !== null} onClose={() => setSelected(null)}>
        {selected && (
          <ItemDrawer
            key={selected}
            orgSlug={orgSlug}
            boardId={boardId}
            itemId={selected}
            members={snapshot.members}
            viewer={snapshot.viewer}
            boardOwnerId={snapshot.boardOwnerId}
            boardItems={snapshot.items.map((i) => ({ id: i.id, title: i.title }))}
            onClose={() => setSelected(null)}
            onBoardChanged={onChanged}
          />
        )}
      </Drawer>

      <Modal open={sumOpen} onClose={() => setSumOpen(false)} title="✨ Board summary" width={460}>
        <div className="p-5">
          {sumBusy ? (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner size={16} /> Analyzing the board…</div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{summary}</p>
          )}
        </div>
      </Modal>

      {view === "table" && selectedRows.size > 0 && (
        <BulkBar
          orgSlug={orgSlug}
          boardId={boardId}
          itemIds={[...selectedRows]}
          members={snapshot.members}
          boards={boards}
          onDone={() => { clearSelection(); onChanged(); }}
          onClear={clearSelection}
        />
      )}
    </div>
  );
}
