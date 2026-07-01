"use client";

import { useEffect, useRef, useState } from "react";
import type { SnapshotMember } from "@/lib/board/types";
import type { ClientColumn, ClientItem } from "@/lib/board/types";
import type { CellInput } from "@/lib/board/cells";
import { setCellValueAction } from "@/lib/actions/items";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem } from "@/components/ui/menu";
import { LabelPill } from "@/components/board/pills";
import { toDateInput } from "@/lib/time";

export function Cell({
  orgSlug,
  item,
  column,
  members,
  onChanged,
}: {
  orgSlug: string;
  item: ClientItem;
  column: ClientColumn;
  members: SnapshotMember[];
  onChanged: () => void;
}) {
  const value = item.values[column.id];
  async function save(input: CellInput) {
    await setCellValueAction(orgSlug, item.id, column.id, input);
    onChanged();
  }

  switch (column.type) {
    case "text":
    case "link":
      return <TextCell initial={value?.valueText ?? ""} onSave={(t) => save({ text: t })} />;

    case "number":
      return (
        <TextCell
          initial={value?.valueNumber ?? ""}
          numeric
          onSave={(t) => save({ number: t === "" ? null : Number(t) })}
        />
      );

    case "date":
      return (
        <input
          type="date"
          defaultValue={toDateInput(value?.valueDate)}
          onChange={(e) => save({ date: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className="w-full bg-transparent text-sm text-slate-700 outline-none"
        />
      );

    case "timeline":
      return <TimelineCell start={value?.valueDate ?? null} end={value?.valueDateEnd ?? null} onSave={save} />;

    case "checkbox":
      return (
        <input
          type="checkbox"
          defaultChecked={!!value?.valueBool}
          onChange={(e) => save({ bool: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
        />
      );

    case "select":
    case "status": {
      const current = column.labels.find((l) => l.id === value?.valueLabelId);
      return (
        <Menu
          width={180}
          trigger={({ toggle }) => (
            <button onClick={toggle} className="flex w-full items-center">
              {current ? <LabelPill label={current.label} color={current.color} /> : <Dash />}
            </button>
          )}
        >
          {(close) => (
            <>
              {column.labels.map((l) => (
                <MenuItem key={l.id} onClick={() => { save({ labelId: l.id }); close(); }}>
                  <LabelPill label={l.label} color={l.color} />
                </MenuItem>
              ))}
              {column.labels.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No options. Add some in board settings.</p>}
              {current && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <MenuItem onClick={() => { save({ labelId: null }); close(); }} className="text-slate-400">Clear</MenuItem>
                </>
              )}
            </>
          )}
        </Menu>
      );
    }

    case "person": {
      const current = members.find((m) => m.id === value?.valueUser);
      return (
        <Menu
          width={220}
          trigger={({ toggle }) => (
            <button onClick={toggle} className="flex w-full items-center gap-2">
              {current ? (
                <>
                  <Avatar name={current.name} email={current.email} size={22} />
                  <span className="truncate text-sm text-slate-700">{current.name ?? current.email}</span>
                </>
              ) : (
                <Dash />
              )}
            </button>
          )}
        >
          {(close) => (
            <>
              {members.map((m) => (
                <MenuItem key={m.id} onClick={() => { save({ userId: m.id }); close(); }}>
                  <Avatar name={m.name} email={m.email} size={22} />
                  <span className="truncate">{m.name ?? m.email}</span>
                </MenuItem>
              ))}
              {current && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <MenuItem onClick={() => { save({ userId: null }); close(); }} className="text-slate-400">Unassign</MenuItem>
                </>
              )}
            </>
          )}
        </Menu>
      );
    }
  }
}

function Dash() {
  return <span className="text-sm text-slate-300">—</span>;
}

function TextCell({
  initial,
  numeric,
  onSave,
}: {
  initial: string;
  numeric?: boolean;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  // Pull in remote edits from the 15s poll, but never overwrite what the user is typing.
  useEffect(() => {
    if (document.activeElement !== ref.current) setV(initial);
  }, [initial]);
  return (
    <input
      ref={ref}
      type={numeric ? "number" : "text"}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== initial && onSave(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-300"
      placeholder="—"
    />
  );
}

function TimelineCell({
  start,
  end,
  onSave,
}: {
  start: string | null;
  end: string | null;
  onSave: (input: CellInput) => void;
}) {
  const [s, setS] = useState(toDateInput(start));
  const [e, setE] = useState(toDateInput(end));
  const sRef = useRef<HTMLInputElement>(null);
  const eRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== sRef.current) setS(toDateInput(start));
  }, [start]);
  useEffect(() => {
    if (document.activeElement !== eRef.current) setE(toDateInput(end));
  }, [end]);
  function commit(ns: string, ne: string) {
    onSave({ date: ns ? new Date(ns).toISOString() : null, dateEnd: ne ? new Date(ne).toISOString() : null });
  }
  return (
    <div className="flex items-center gap-1 text-xs text-slate-600">
      <input ref={sRef} type="date" value={s} onChange={(ev) => { setS(ev.target.value); commit(ev.target.value, e); }} className="bg-transparent outline-none" />
      <span className="text-slate-300">→</span>
      <input ref={eRef} type="date" value={e} onChange={(ev) => { setE(ev.target.value); commit(s, ev.target.value); }} className="bg-transparent outline-none" />
    </div>
  );
}
