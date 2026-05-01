import { EventType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { validateEventPayload } from "./schemas";

describe("validateEventPayload", () => {
  it("rejects invalid payload shape for REPLAN_REQUESTED", () => {
    expect(() =>
      validateEventPayload(EventType.REPLAN_REQUESTED, {
        triggeredBy: "operator",
        reason: "",
      }),
    ).toThrowError();
  });

  it("accepts valid payload shape for TICKET_UPDATED", () => {
    const payload = validateEventPayload(EventType.TICKET_UPDATED, {
      fieldsChanged: ["status"],
      summary: "Moved ticket to in progress.",
    });

    expect(payload.fieldsChanged).toEqual(["status"]);
  });

  it("accepts structured WORKLOG_ADDED payload for IMPLEMENTER role", () => {
    const payload = validateEventPayload(EventType.WORKLOG_ADDED, {
      schemaVersion: 1,
      runId: "run-1",
      ticketId: "ticket-1",
      agentRole: "IMPLEMENTER",
      summary: "Implemented endpoint and tests.",
      status: "COMPLETED",
      findings: ["Route works"],
      risks: ["Auth edge case"],
      suggestedNextSteps: ["Add integration coverage"],
      replanSignal: {
        shouldReplan: false,
        severity: "LOW",
      },
      roleSpecificOutput: {
        implementationPlan: ["Add route", "Map errors"],
        touchedAreas: ["src/app/api/tickets/[ticketId]/agent-run"],
        technicalRisks: ["Error mapping regressions"],
        testSuggestions: ["Add route tests"],
      },
    });

    expect(payload).toEqual(
      expect.objectContaining({
        agentRole: "IMPLEMENTER",
        status: "COMPLETED",
      }),
    );
  });

  it("rejects WORKLOG_ADDED payload when roleSpecificOutput does not match agentRole", () => {
    expect(() =>
      validateEventPayload(EventType.WORKLOG_ADDED, {
        schemaVersion: 1,
        runId: "run-1",
        ticketId: "ticket-1",
        agentRole: "IMPLEMENTER",
        summary: "Invalid role-specific output.",
        status: "COMPLETED",
        findings: ["Mismatch"],
        risks: ["Schema mismatch"],
        suggestedNextSteps: ["Fix payload"],
        replanSignal: {
          shouldReplan: false,
          severity: "LOW",
        },
        roleSpecificOutput: {
          testPlan: ["Run tests"],
          edgeCases: ["Missing fields"],
          regressionRisks: ["Contract mismatch"],
          acceptanceCheckResults: [
            {
              check: "A check",
              result: "PASS",
            },
          ],
        },
      }),
    ).toThrowError();
  });
});
