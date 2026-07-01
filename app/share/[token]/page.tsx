import { Lock } from "lucide-react";
import Link from "next/link";
import { LabelPill, PriorityPill, StatusPill } from "@/components/board/pills";
import { getSharedBoard, type SharedCell } from "@/lib/share";

export const dynamic = "force-dynamic";

function Cell({ cell }: { cell: SharedCell | undefined }) {
  if (!cell || cell.kind === "empty") return <span className="text-slate-300">—</span>;
  if (cell.kind === "label") return <LabelPill label={cell.label} color={cell.color} />;
  return <span className="text-slate-700">{cell.text}</span>;
}

export default async function SharedBoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const board = await getSharedBoard(token);

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Board unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">This share link has been turned off or doesn&apos;t exist.</p>
          <Link href="/" className="mt-5 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800">Go to Throughline</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{board.orgName}</p>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">{board.boardName}</h1>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            <Lock size={12} /> Read-only
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {board.boardDescription && <p className="mb-6 max-w-2xl text-sm text-slate-600">{board.boardDescription}</p>}

        {board.items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">No tasks on this board yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Due</th>
                  {board.columns.map((c) => (
                    <th key={c.id} className="px-4 py-3">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">{it.title}</td>
                    <td className="px-4 py-3"><StatusPill status={it.status} /></td>
                    <td className="px-4 py-3 text-slate-600">{it.assigneeName ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3"><PriorityPill priority={it.priority} /></td>
                    <td className="px-4 py-3 text-slate-600">{it.dueDate ?? <span className="text-slate-300">—</span>}</td>
                    {board.columns.map((c) => (
                      <td key={c.id} className="px-4 py-3"><Cell cell={it.cells[c.id]} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Shared via <Link href="/" className="font-medium text-indigo-500 hover:text-indigo-700">Throughline</Link>
        </p>
      </div>
    </main>
  );
}
