import type { Prisma } from "@prisma/client";

const MAX_WORKLOG_LIST_ITEMS = 3;
const MAX_ROLE_SPECIFIC_ITEMS = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNonEmptyStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function formatBoundedList(label: string, value: unknown, maxItems: number): string | null {
  const items = toNonEmptyStringArray(value);
  if (items.length === 0) {
    return null;
  }

  const shown = items.slice(0, maxItems);
  const remainingCount = items.length - shown.length;
  const remainingSuffix = remainingCount > 0 ? ` (+${remainingCount} more)` : "";

  return `${label}: ${shown.join("; ")}${remainingSuffix}`;
}

function summarizeReplanSignal(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const shouldReplanRaw = value["shouldReplan"];
  const shouldReplan = typeof shouldReplanRaw === "boolean" ? String(shouldReplanRaw) : "unknown";
  const severity = toNonEmptyString(value["severity"]) ?? "UNKNOWN";
  const reason = toNonEmptyString(value["reason"]);

  return reason
    ? `replanSignal: shouldReplan=${shouldReplan}, severity=${severity}, reason=${reason}`
    : `replanSignal: shouldReplan=${shouldReplan}, severity=${severity}`;
}

function summarizeRoleSpecificOutput(agentRole: string | null, value: unknown): string | null {
  if (!agentRole || !isRecord(value)) {
    return null;
  }

  switch (agentRole) {
    case "PLANNER":
      return formatBoundedList("plannerFocus", value["planningNotes"], MAX_ROLE_SPECIFIC_ITEMS);
    case "IMPLEMENTER":
      return formatBoundedList(
        "implementerFocus",
        value["implementationPlan"],
        MAX_ROLE_SPECIFIC_ITEMS,
      );
    case "QA":
      return formatBoundedList("qaFocus", value["testPlan"], MAX_ROLE_SPECIFIC_ITEMS);
    default:
      return null;
  }
}

function summarizeGenericEventPayload(type: string, payload: Record<string, unknown>): string {
  const summaryCandidates = [
    payload["summary"],
    payload["reason"],
    payload["rationale"],
    payload["decision"],
    payload["blocker"],
    payload["change"],
  ];
  const summary = summaryCandidates.find((candidate): candidate is string => {
    return typeof candidate === "string" && candidate.trim().length > 0;
  });

  return summary ? `${type}: ${summary}` : `${type} event recorded.`;
}

function isStructuredWorklogPayload(payload: Record<string, unknown>): boolean {
  return (
    toNonEmptyString(payload["agentRole"]) !== null &&
    toNonEmptyString(payload["status"]) !== null &&
    toNonEmptyString(payload["summary"]) !== null &&
    Array.isArray(payload["findings"]) &&
    Array.isArray(payload["risks"]) &&
    Array.isArray(payload["suggestedNextSteps"]) &&
    isRecord(payload["replanSignal"])
  );
}

export function summarizeWorklogAddedForReplan(payload: Record<string, unknown>): string {
  const summary = toNonEmptyString(payload["summary"]);
  const agentRole = toNonEmptyString(payload["agentRole"]);
  const status = toNonEmptyString(payload["status"]);
  const roleStatusLabel = [agentRole, status].filter((part): part is string => Boolean(part));
  const prefix =
    roleStatusLabel.length > 0 ? `WORKLOG_ADDED [${roleStatusLabel.join("/")}]` : "WORKLOG_ADDED";

  const details: string[] = [];

  if (summary) {
    details.push(summary);
  }

  const findingsSummary = formatBoundedList(
    "findings",
    payload["findings"],
    MAX_WORKLOG_LIST_ITEMS,
  );
  if (findingsSummary) {
    details.push(findingsSummary);
  }

  const risksSummary = formatBoundedList("risks", payload["risks"], MAX_WORKLOG_LIST_ITEMS);
  if (risksSummary) {
    details.push(risksSummary);
  }

  const nextStepsSummary = formatBoundedList(
    "suggestedNextSteps",
    payload["suggestedNextSteps"],
    MAX_WORKLOG_LIST_ITEMS,
  );
  if (nextStepsSummary) {
    details.push(nextStepsSummary);
  }

  const replanSignalSummary = summarizeReplanSignal(payload["replanSignal"]);
  if (replanSignalSummary) {
    details.push(replanSignalSummary);
  }

  const roleSpecificSummary = summarizeRoleSpecificOutput(agentRole, payload["roleSpecificOutput"]);
  if (roleSpecificSummary) {
    details.push(roleSpecificSummary);
  }

  if (details.length === 0) {
    return `${prefix} event recorded.`;
  }

  return `${prefix}: ${details.join(" | ")}`;
}

export function summarizeEventForReplan(type: string, payload: Prisma.JsonValue): string {
  if (!isRecord(payload)) {
    return `${type} event recorded.`;
  }

  if (type === "WORKLOG_ADDED") {
    if (isStructuredWorklogPayload(payload)) {
      return summarizeWorklogAddedForReplan(payload);
    }

    return summarizeGenericEventPayload(type, payload);
  }

  return summarizeGenericEventPayload(type, payload);
}
