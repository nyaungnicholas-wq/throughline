"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Reports } from "@/lib/reports";
import { swatch } from "@/lib/board/palette";

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-3xl font-bold tracking-tight" style={{ color: accent ?? "#0f172a" }}>{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-800">{title}</h2>
      {children}
    </div>
  );
}

export function ReportsView({ orgName, reports }: { orgName: string; reports: Reports }) {
  const statusData = reports.statusBreakdown.filter((s) => s.count > 0);
  const onTimeData = [
    { name: "On time", value: reports.onTime.onTime, color: "#22c55e" },
    { name: "Late", value: reports.onTime.late, color: "#ef4444" },
  ].filter((d) => d.value > 0);
  const onTimePct = reports.onTime.onTime + reports.onTime.late > 0
    ? Math.round((reports.onTime.onTime / (reports.onTime.onTime + reports.onTime.late)) * 100)
    : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">{orgName} · delivery metrics</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total tasks" value={reports.totals.total} />
        <Stat label="Approved" value={reports.totals.approved} accent="#15803d" />
        <Stat label="Overdue" value={reports.totals.overdue} accent={reports.totals.overdue ? "#b91c1c" : undefined} />
        <Stat label="Due this week" value={reports.totals.dueThisWeek} accent="#b45309" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Throughput (approved per week)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={reports.throughput} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Status breakdown">
          {statusData.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">No tasks yet.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={220}>
                <PieChart>
                  <Pie data={statusData} dataKey="count" nameKey="label" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {statusData.map((s) => <Cell key={s.status} fill={swatch(s.swatch).dot} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {statusData.map((s) => (
                  <div key={s.status} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: swatch(s.swatch).dot }} />
                    <span className="flex-1 text-slate-600">{s.label}</span>
                    <span className="font-semibold text-slate-800">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title="Workload by person">
          {reports.workload.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">No active assignments.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, reports.workload.length * 44)}>
              <BarChart data={reports.workload} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="active" name="Active" fill="#6366f1" radius={[0, 6, 6, 0]} />
                <Bar dataKey="overdue" name="Overdue" fill="#ef4444" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="On-time approval rate">
          {onTimeData.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">No approved tasks with due dates yet.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={onTimeData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                      {onTimeData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                {onTimePct !== null && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-slate-800">{onTimePct}%</span>
                    <span className="text-xs text-slate-400">on time</span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-1.5 text-sm">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /><span className="flex-1 text-slate-600">On time</span><span className="font-semibold">{reports.onTime.onTime}</span></div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /><span className="flex-1 text-slate-600">Late</span><span className="font-semibold">{reports.onTime.late}</span></div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
