"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { markAllReadAction } from "@/lib/actions/notifications";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useOrgStream } from "@/components/shell/useOrgStream";
import { timeAgo } from "@/lib/time";

type Row = {
  id: string;
  type: string;
  actorName: string | null;
  itemTitle: string | null;
  data: { title?: string };
  readAt: string | null;
  createdAt: string;
};
type Payload = { rows: Row[]; unread: number };

function text(r: Row): string {
  const who = r.actorName ?? "Someone";
  const title = r.itemTitle ?? r.data?.title ?? "a task";
  switch (r.type) {
    case "assigned": return `${who} assigned you "${title}"`;
    case "accepted": return `${who} accepted "${title}"`;
    case "submitted": return `${who} submitted "${title}" for review`;
    case "approved": return `${who} approved "${title}"`;
    case "changes_requested": return `${who} requested changes on "${title}"`;
    case "comment": return `${who} commented on "${title}"`;
    case "board_owner": return `${who} made you the lead on "${title}"`;
    default: return `${who} updated "${title}"`;
  }
}

export function NotificationBell({ orgSlug, initial }: { orgSlug: string; initial: Payload }) {
  const qc = useQueryClient();
  const { data } = useQuery<Payload>({
    queryKey: ["notifications", orgSlug],
    queryFn: async () => {
      const res = await fetch(`/api/${orgSlug}/notifications`, { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    initialData: initial,
    refetchInterval: 20_000,
  });
  useOrgStream(orgSlug, () => qc.invalidateQueries({ queryKey: ["notifications", orgSlug] }));

  const unread = data?.unread ?? 0;
  const rows = data?.rows ?? [];

  return (
    <Menu
      align="right"
      width={340}
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div className="w-[340px]">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {unread > 0 && (
              <button
                onClick={async () => {
                  await markAllReadAction(orgSlug);
                  qc.invalidateQueries({ queryKey: ["notifications", orgSlug] });
                }}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto tl-scroll">
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">You&apos;re all caught up.</p>
            ) : (
              rows.map((r) => (
                <MenuItem key={r.id} onClick={close} className="items-start">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${r.readAt ? "bg-transparent" : "bg-indigo-500"}`} />
                  <span className="flex flex-col">
                    <span className="text-sm leading-snug text-slate-700">{text(r)}</span>
                    <span className="text-xs text-slate-400">{timeAgo(r.createdAt)}</span>
                  </span>
                </MenuItem>
              ))
            )}
          </div>
        </div>
      )}
    </Menu>
  );
}
