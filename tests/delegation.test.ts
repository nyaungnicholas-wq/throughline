import { describe, expect, it } from "vitest";
import { availableActions, dragTargetsFor } from "@/lib/delegation-meta";

const manager = { id: "m1", role: "manager" as const };
const member = { id: "u1", role: "member" as const };

describe("delegation authorization rules", () => {
  it("a manager can assign an unassigned item; a member cannot", () => {
    expect(availableActions({ status: "unassigned", assigneeId: null }, manager)).toContain("assign");
    expect(availableActions({ status: "unassigned", assigneeId: null }, member)).not.toContain("assign");
  });

  it("only the assignee can accept an assigned item", () => {
    expect(availableActions({ status: "assigned", assigneeId: "u1" }, member)).toContain("accept");
    expect(availableActions({ status: "assigned", assigneeId: "other" }, member)).not.toContain("accept");
  });

  it("NO self-approval — the assignee cannot approve their own submitted work, even as a manager", () => {
    const mgrAssignee = { id: "m1", role: "manager" as const };
    expect(availableActions({ status: "submitted", assigneeId: "m1" }, mgrAssignee)).not.toContain("approve");
    expect(availableActions({ status: "submitted", assigneeId: "someoneElse" }, mgrAssignee)).toContain("approve");
  });

  it("a board owner counts as a manager ON their board", () => {
    const owner = { id: "u1", role: "member" as const };
    // without ownership, a member sees no manager actions
    expect(availableActions({ status: "unassigned", assigneeId: null }, owner)).not.toContain("assign");
    // as the board owner, they can
    expect(availableActions({ status: "unassigned", assigneeId: null }, owner, "u1")).toContain("assign");
  });

  it("drag targets never include assign/reassign (drag can't assign someone)", () => {
    const targets = dragTargetsFor({ status: "in_progress", assigneeId: "u1" }, member);
    expect(Object.values(targets)).not.toContain("assign");
    expect(Object.values(targets)).not.toContain("reassign");
  });
});
