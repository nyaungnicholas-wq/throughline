import type { ItemStatus, Priority } from "@/db/schema";
import { aiJson, aiText, isAiLive } from "@/lib/ai/client";

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
function asPriority(s: unknown): Priority | null {
  return typeof s === "string" && (PRIORITIES as string[]).includes(s) ? (s as Priority) : null;
}

/* ───────────────────────── 1. Generate a board from a brief ───────────────────────── */

export type GenTask = {
  title: string;
  priority: Priority | null;
  dueInDays: number | null;
  notes: string | null;
  assignee: string | null; // member name hint, or null
};

export async function aiGenerateTasks(brief: string, memberNames: string[]): Promise<GenTask[]> {
  if (isAiLive()) {
    try {
      const system =
        "You are a senior project manager. Break a project brief into a concrete, ordered task list a team can execute. Be specific and realistic. Output strictly valid JSON with no comments and no trailing commas.";
      const prompt = `Project brief:\n"""${brief}"""\n\nTeam members (you may assign tasks to them by name, or leave unassigned): ${memberNames.join(", ") || "(none)"}\n\nReturn ONLY JSON of this shape:\n{"tasks":[{"title":"string","priority":"low|medium|high|urgent","dueInDays":number,"notes":"short note or empty","assignee":"a member name from the list or null"}]}\nProduce 5-12 tasks, ordered by when they should start. dueInDays is days from today.`;
      const out = await aiJson<{ tasks: Array<Record<string, unknown>> }>({ system, prompt, temperature: 0.5, maxTokens: 4000 });
      const tasks = (out.tasks ?? []).slice(0, 14).map((t) => ({
        title: String(t.title ?? "Untitled task").slice(0, 200),
        priority: asPriority(t.priority),
        dueInDays: typeof t.dueInDays === "number" ? Math.round(t.dueInDays) : null,
        notes: t.notes ? String(t.notes).slice(0, 500) : null,
        assignee: t.assignee && memberNames.includes(String(t.assignee)) ? String(t.assignee) : null,
      }));
      if (tasks.length) return tasks;
      // empty result → fall through to the deterministic builder below
    } catch {
      // live call or JSON parse failed → fall back to the deterministic builder
    }
  }

  // Deterministic builder: split the brief into actionable chunks.
  const chunks = brief
    .split(/\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .slice(0, 8);
  const base = chunks.length ? chunks : ["Define scope and goals", "Draft the plan", "Build the first version", "Review and ship"];
  return base.map((c, i) => ({
    title: c.replace(/^[-*\d.\s]+/, "").replace(/^./, (m) => m.toUpperCase()).slice(0, 120),
    priority: PRIORITIES[(i + 1) % 4],
    dueInDays: (i + 1) * 3,
    notes: null,
    assignee: memberNames.length ? memberNames[i % memberNames.length] : null,
  }));
}

/* ───────────────────────── 2. Summaries ───────────────────────── */

export async function aiSummarizeThread(
  title: string,
  comments: Array<{ author: string; body: string }>,
  activityCount: number,
): Promise<string> {
  if (isAiLive()) {
    const convo = comments.map((c) => `${c.author}: ${c.body}`).join("\n") || "(no comments)";
    return aiText({
      system: "Summarize a task's discussion for a busy manager in 2-4 short sentences. Capture decisions, blockers, and what's next.",
      prompt: `Task: ${title}\n\nComments:\n${convo}\n\nTotal activity events: ${activityCount}.`,
      temperature: 0.3,
      maxTokens: 400,
    });
  }
  if (comments.length === 0) return `"${title}" has no discussion yet — ${activityCount} activity event(s) recorded.`;
  const last = comments[comments.length - 1];
  return `${comments.length} comment(s) on "${title}". Most recent — ${last.author}: "${last.body.slice(0, 140)}". ${activityCount} activity event(s) total.`;
}

export async function aiSummarizeBoard(
  boardName: string,
  stats: { total: number; byStatus: Record<string, number>; overdue: number; topPeople: Array<{ name: string; active: number }> },
): Promise<string> {
  const statusLine = Object.entries(stats.byStatus).map(([s, n]) => `${n} ${s.replace(/_/g, " ")}`).join(", ");
  if (isAiLive()) {
    return aiText({
      system: "You are a delivery lead. Give a crisp health summary of a board for a manager: progress, risks, and one recommended next action. 3-5 sentences.",
      prompt: `Board: ${boardName}\nTotal tasks: ${stats.total}\nBy status: ${statusLine}\nOverdue: ${stats.overdue}\nWorkload: ${stats.topPeople.map((p) => `${p.name} (${p.active})`).join(", ") || "unassigned"}`,
      temperature: 0.4,
      maxTokens: 500,
    });
  }
  const done = stats.byStatus["approved"] ?? 0;
  const pct = stats.total ? Math.round((done / stats.total) * 100) : 0;
  const risk = stats.overdue > 0 ? ` ⚠️ ${stats.overdue} task(s) overdue — address these first.` : " No overdue tasks.";
  return `"${boardName}" is ${pct}% complete (${done}/${stats.total} approved). Status: ${statusLine || "no tasks"}.${risk}${stats.topPeople[0] ? ` ${stats.topPeople[0].name} has the most active work (${stats.topPeople[0].active}).` : ""}`;
}

/* ───────────────────────── 3. Delegation helper ───────────────────────── */

export type DelegationSuggestion = {
  assigneeId: string | null;
  assigneeName: string | null;
  priority: Priority;
  dueInDays: number;
  description: string;
  reason: string;
};

export async function aiSuggestDelegation(
  taskTitle: string,
  members: Array<{ id: string; name: string; active: number }>,
): Promise<DelegationSuggestion> {
  const leastLoaded = [...members].sort((a, b) => a.active - b.active)[0] ?? null;
  if (isAiLive() && members.length) {
    try {
      const out = await aiJson<Record<string, unknown>>({
        system: "You assign work fairly. Pick the best assignee considering current workload (lower = more available). Suggest a priority, a reasonable due date, and a one-line task description.",
        prompt: `Task: "${taskTitle}"\nTeam (name — active tasks): ${members.map((m) => `${m.name} (${m.active})`).join(", ")}\n\nReturn ONLY JSON: {"assignee":"member name","priority":"low|medium|high|urgent","dueInDays":number,"description":"one line","reason":"why this person, one line"}`,
        temperature: 0.4,
        maxTokens: 400,
      });
      const picked = members.find((m) => m.name === String(out.assignee)) ?? leastLoaded;
      return {
        assigneeId: picked?.id ?? null,
        assigneeName: picked?.name ?? null,
        priority: asPriority(out.priority) ?? "medium",
        dueInDays: typeof out.dueInDays === "number" ? Math.round(out.dueInDays) : 7,
        description: out.description ? String(out.description).slice(0, 400) : "",
        reason: out.reason ? String(out.reason).slice(0, 200) : "Balanced for workload.",
      };
    } catch {
      /* fall through to heuristic */
    }
  }
  return {
    assigneeId: leastLoaded?.id ?? null,
    assigneeName: leastLoaded?.name ?? null,
    priority: "medium",
    dueInDays: 7,
    description: `Work item: ${taskTitle}.`,
    reason: leastLoaded ? `${leastLoaded.name} has the lightest current load (${leastLoaded.active} active).` : "No members to assign.",
  };
}

/* ───────────────────────── 4. Ask-your-workspace ───────────────────────── */

export type WorkspaceContext = {
  boards: Array<{ name: string; items: Array<{ title: string; status: ItemStatus; assignee: string | null; priority: Priority | null; overdue: boolean }> }>;
};

export async function aiAnswerWorkspace(question: string, ctx: WorkspaceContext): Promise<string> {
  if (isAiLive()) {
    const flat = ctx.boards
      .map((b) => `# ${b.name}\n` + b.items.map((i) => `- ${i.title} [${i.status}${i.overdue ? ", OVERDUE" : ""}${i.priority ? ", " + i.priority : ""}${i.assignee ? ", @" + i.assignee : ", unassigned"}]`).join("\n"))
      .join("\n\n");
    return aiText({
      system: "You answer questions about a team's work using ONLY the provided board data. Be concise and concrete; cite task titles. If the answer isn't in the data, say so.",
      prompt: `Workspace data:\n${flat}\n\nQuestion: ${question}`,
      temperature: 0.3,
      maxTokens: 700,
    });
  }

  // Deterministic mock: simple intent matching over the structured data.
  const all = ctx.boards.flatMap((b) => b.items.map((i) => ({ ...i, board: b.name })));
  const q = question.toLowerCase();
  const list = (rows: typeof all) =>
    rows.length ? rows.map((r) => `• ${r.title} — ${r.board}${r.assignee ? ` (@${r.assignee})` : ""}`).join("\n") : "Nothing matches that.";
  if (q.includes("overdue") || q.includes("late")) return `Overdue items:\n${list(all.filter((r) => r.overdue))}`;
  if (q.includes("approv")) return `Waiting for approval:\n${list(all.filter((r) => r.status === "submitted"))}`;
  if (q.includes("unassigned") || q.includes("nobody")) return `Unassigned:\n${list(all.filter((r) => !r.assignee))}`;
  const nameHit = all.find((r) => r.assignee && q.includes(r.assignee.toLowerCase().split(" ")[0]));
  if (nameHit && nameHit.assignee) {
    const who = nameHit.assignee;
    return `${who} is working on:\n${list(all.filter((r) => r.assignee === who && r.status !== "approved"))}`;
  }
  return `(Mock mode — add GEMINI_API_KEY or NVIDIA_API_KEY for full answers.)\nThe workspace has ${all.length} task(s) across ${ctx.boards.length} board(s); ${all.filter((r) => r.overdue).length} overdue, ${all.filter((r) => r.status === "submitted").length} awaiting approval.`;
}
