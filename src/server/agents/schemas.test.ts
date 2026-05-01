import { describe, expect, it } from "vitest";

import { agentOutputSchema, parseAgentOutput } from "./schemas";

const sharedFields = {
  schemaVersion: 1 as const,
  summary: "Completed focused role output for ticket execution.",
  status: "COMPLETED" as const,
  findings: ["Primary finding"],
  risks: ["Primary risk"],
  suggestedNextSteps: ["Primary next step"],
  replanSignal: {
    shouldReplan: false,
    severity: "LOW" as const,
  },
};

const validPlannerOutput = {
  ...sharedFields,
  role: "PLANNER" as const,
  planningNotes: ["Plan milestone 1"],
  dependencyNotes: ["Need API contract before implementation"],
  scopeConcerns: ["Scope may expand with integrations"],
  acceptanceCriteriaSuggestions: ["Define measurable acceptance criteria"],
};

const validImplementerOutput = {
  ...sharedFields,
  role: "IMPLEMENTER" as const,
  implementationPlan: ["Implement API endpoint", "Add integration tests"],
  touchedAreas: ["src/app/api/tickets", "src/server/tickets"],
  technicalRisks: ["Potential race condition on concurrent updates"],
  testSuggestions: ["Add unit tests for retry path"],
};

const validQaOutput = {
  ...sharedFields,
  role: "QA" as const,
  testPlan: ["Run API route tests"],
  edgeCases: ["Patch with empty payload"],
  regressionRisks: ["Existing retry behavior may break"],
  acceptanceCheckResults: [
    {
      check: "Ticket updates return 200 for valid payload",
      result: "PASS" as const,
      notes: "Verified in route test.",
    },
  ],
};

describe("agentOutputSchema", () => {
  it("passes for a valid PLANNER output", () => {
    const parsed = parseAgentOutput(validPlannerOutput);
    expect(parsed.role).toBe("PLANNER");
  });

  it("passes for a valid IMPLEMENTER output", () => {
    const result = agentOutputSchema.safeParse(validImplementerOutput);
    expect(result.success).toBe(true);
  });

  it("passes for a valid QA output", () => {
    const result = agentOutputSchema.safeParse(validQaOutput);
    expect(result.success).toBe(true);
  });

  it("fails for an unknown role", () => {
    const result = agentOutputSchema.safeParse({
      ...validPlannerOutput,
      role: "ARCHITECT",
    });
    expect(result.success).toBe(false);
  });

  it("fails for old roles PM, TECH_LEAD, and ENGINEER", () => {
    for (const oldRole of ["PM", "TECH_LEAD", "ENGINEER"]) {
      const result = agentOutputSchema.safeParse({
        ...validPlannerOutput,
        role: oldRole,
      });
      expect(result.success).toBe(false);
    }
  });

  it("fails when a shared required field is missing", () => {
    const withoutSummary = Object.fromEntries(
      Object.entries(validPlannerOutput).filter(([key]) => key !== "summary"),
    );
    const result = agentOutputSchema.safeParse(withoutSummary);
    expect(result.success).toBe(false);
  });

  it("fails when a role-specific required field is missing", () => {
    const withoutImplementationPlan = Object.fromEntries(
      Object.entries(validImplementerOutput).filter(([key]) => key !== "implementationPlan"),
    );
    const result = agentOutputSchema.safeParse(withoutImplementationPlan);
    expect(result.success).toBe(false);
  });

  it("fails for unknown extra fields because schemas are strict", () => {
    const result = agentOutputSchema.safeParse({
      ...validPlannerOutput,
      extraField: "should fail",
    });
    expect(result.success).toBe(false);
  });

  it("fails for invalid replanSignal.severity", () => {
    const result = agentOutputSchema.safeParse({
      ...validPlannerOutput,
      replanSignal: {
        shouldReplan: true,
        reason: "Needs broader replanning",
        severity: "CRITICAL",
      },
    });
    expect(result.success).toBe(false);
  });

  it("fails for invalid QA acceptanceCheckResults result", () => {
    const result = agentOutputSchema.safeParse({
      ...validQaOutput,
      acceptanceCheckResults: [
        {
          check: "A check",
          result: "SKIPPED",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
