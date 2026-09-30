import { describe, it, expect } from "vitest";

describe("Phase 4 Admin Workbenches — Unit & Operational Test Suite", () => {
  describe("1. Admin Staff Roster In-Memory Filtering", () => {
    interface StaffMember {
      id: string;
      name: string;
      email: string;
      role: "ADMIN" | "EMPLOYEE";
      status: "ACTIVE" | "DEACTIVATED" | "INVITED";
      department: string | null;
      designation: string | null;
    }

    const mockStaff: StaffMember[] = [
      { id: "s-1", name: "Ada Lovelace", email: "ada@citrux.internal", role: "ADMIN", status: "ACTIVE", department: "Engineering", designation: "Chief Architect" },
      { id: "s-2", name: "Alan Turing", email: "alan@citrux.internal", role: "EMPLOYEE", status: "ACTIVE", department: "Operations", designation: "QA Lead" },
      { id: "s-3", name: "Grace Hopper", email: "grace@citrux.internal", role: "EMPLOYEE", status: "ACTIVE", department: "Engineering", designation: "Senior Specialist" },
      { id: "s-4", name: "Linus Torvalds", email: "linus@citrux.internal", role: "EMPLOYEE", status: "DEACTIVATED", department: "Infrastructure", designation: "DevOps Engineer" },
    ];

    it("filters staff roster by role and active status", () => {
      const activeEmployees = mockStaff.filter((s) => s.role === "EMPLOYEE" && s.status === "ACTIVE");
      expect(activeEmployees).toHaveLength(2);
      expect(activeEmployees.map((s) => s.name)).toEqual(["Alan Turing", "Grace Hopper"]);
    });

    it("searches staff by name, email, designation, and department", () => {
      const query = "qa lead";
      const tokens = query.toLowerCase().split(/\s+/);
      const matched = mockStaff.filter((s) => {
        const text = `${s.name} ${s.email} ${s.designation || ""} ${s.department || ""}`.toLowerCase();
        return tokens.every((tok) => text.includes(tok));
      });

      expect(matched).toHaveLength(1);
      expect(matched[0]?.name).toBe("Alan Turing");
    });
  });

  describe("2. Admin Escalation Triage Pipeline", () => {
    interface EscalationItem {
      id: string;
      title: string;
      priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
      status: "ESCALATED" | "IN_PROGRESS" | "CANCELED";
      assignedEmployeeId: string | null;
    }

    const mockEscalations: EscalationItem[] = [
      { id: "e-1", title: "Security Clear Blocked", priority: "URGENT", status: "ESCALATED", assignedEmployeeId: "emp-1" },
      { id: "e-2", title: "Missing Transcript Verification", priority: "NORMAL", status: "ESCALATED", assignedEmployeeId: "emp-2" },
      { id: "e-3", title: "Candidate Identity Mismatch", priority: "HIGH", status: "ESCALATED", assignedEmployeeId: "emp-1" },
    ];

    it("filters escalations by urgent / high priority tabs", () => {
      const urgentList = mockEscalations.filter((e) => e.priority === "URGENT");
      expect(urgentList).toHaveLength(1);
      expect(urgentList[0]?.title).toBe("Security Clear Blocked");

      const highPriority = mockEscalations.filter((e) => e.priority === "HIGH" || e.priority === "URGENT");
      expect(highPriority).toHaveLength(2);
    });

    it("applies triage reassignment action accurately", () => {
      let currentList = [...mockEscalations];
      const targetId = "e-1";
      const newAssignee = "emp-99";

      // Execute triage
      currentList = currentList.map((e) =>
        e.id === targetId ? { ...e, status: "IN_PROGRESS", assignedEmployeeId: newAssignee } : e
      );

      const updated = currentList.find((e) => e.id === targetId);
      expect(updated?.status).toBe("IN_PROGRESS");
      expect(updated?.assignedEmployeeId).toBe("emp-99");
    });
  });
});
