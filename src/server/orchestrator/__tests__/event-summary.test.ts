import { describe, expect, it } from "vitest";

import { summarizeEventForReplan } from "../event-summary";

describe("summarizeEventForReplan", () => {
  it("summarizes structured WORKLOG_ADDED with bounded useful fields", () => {
    const summary = summarizeEventForReplan("WORKLOG_ADDED", {
      schemaVersion: 1,
      runId: "run-1",
      ticketId: "ticket-1",
      agentRole: "IMPLEMENTER",
      summary: "Implemented API route but follow-up tests are pending.",
      status: "NEEDS_FOLLOWUP",
      findings: ["Route is operational.", "Response shape is stable."],
      risks: ["Missing edge-case tests.", "Potential retry regression."],
      suggestedNextSteps: ["Add regression tests.", "Review retry-path coverage."],
      replanSignal: {
        shouldReplan: true,
        severity: "HIGH",
        reason: "Scope now includes additional test work.",
      },
      roleSpecificOutput: {
        implementationPlan: ["Implement route", "Add tests"],
        touchedAreas: ["SHOULD_NOT_APPEAR"],
      },
    });

    expect(summary).toContain("WORKLOG_ADDED [IMPLEMENTER/NEEDS_FOLLOWUP]");
    expect(summary).toContain("Implemented API route but follow-up tests are pending.");
    expect(summary).toContain("findings: Route is operational.; Response shape is stable.");
    expect(summary).toContain("risks: Missing edge-case tests.; Potential retry regression.");
    expect(summary).toContain(
      "suggestedNextSteps: Add regression tests.; Review retry-path coverage.",
    );
    expect(summary).toContain(
      "replanSignal: shouldReplan=true, severity=HIGH, reason=Scope now includes additional test work.",
    );
  });

  it("bounds long findings, risks, and suggestedNextSteps arrays", () => {
    const summary = summarizeEventForReplan("WORKLOG_ADDED", {
      schemaVersion: 1,
      runId: "run-2",
      ticketId: "ticket-2",
      agentRole: "IMPLEMENTER",
      summary: "Long list payload",
      status: "COMPLETED",
      findings: ["f1", "f2", "f3", "f4", "f5"],
      risks: ["r1", "r2", "r3", "r4"],
      suggestedNextSteps: ["n1", "n2", "n3", "n4"],
      replanSignal: {
        shouldReplan: false,
        severity: "LOW",
      },
      roleSpecificOutput: {
        implementationPlan: ["plan1", "plan2"],
      },
    });

    expect(summary).toContain("findings: f1; f2; f3 (+2 more)");
    expect(summary).toContain("risks: r1; r2; r3 (+1 more)");
    expect(summary).toContain("suggestedNextSteps: n1; n2; n3 (+1 more)");
    expect(summary).not.toContain("f4");
    expect(summary).not.toContain("r4");
    expect(summary).not.toContain("n4");
  });

  it("does not dump roleSpecificOutput wholesale", () => {
    const summary = summarizeEventForReplan("WORKLOG_ADDED", {
      schemaVersion: 1,
      runId: "run-3",
      ticketId: "ticket-3",
      agentRole: "QA",
      summary: "QA output",
      status: "COMPLETED",
      findings: ["ok"],
      risks: ["low"],
      suggestedNextSteps: ["continue"],
      replanSignal: {
        shouldReplan: false,
        severity: "LOW",
      },
      roleSpecificOutput: {
        testPlan: ["critical qa focus", "extra plan that should be bounded"],
        acceptanceCheckResults: [
          { check: "C1", result: "PASS" },
          { check: "C2", result: "FAIL" },
        ],
      },
      rawText: "provider raw output should never be copied",
    });

    expect(summary).toContain("qaFocus: critical qa focus (+1 more)");
    expect(summary).not.toContain("roleSpecificOutput");
    expect(summary).not.toContain("acceptanceCheckResults");
    expect(summary).not.toContain("provider raw output should never be copied");
  });

  it("uses fallback behavior for legacy WORKLOG_ADDED payload", () => {
    const summary = summarizeEventForReplan("WORKLOG_ADDED", {
      agentRole: "PLANNER",
      summary: "Legacy worklog entry.",
      artifacts: ["docs/legacy.md"],
    });

    expect(summary).toBe("WORKLOG_ADDED: Legacy worklog entry.");
  });

  it("preserves non-WORKLOG summary behavior", () => {
    const scopeSummary = summarizeEventForReplan("SCOPE_CHANGED", {
      reason: "Need timeline support.",
    });
    const unknownSummary = summarizeEventForReplan("DECISION_MADE", {
      note: "No standard summary field.",
    });

    expect(scopeSummary).toBe("SCOPE_CHANGED: Need timeline support.");
    expect(unknownSummary).toBe("DECISION_MADE event recorded.");
  });
});
