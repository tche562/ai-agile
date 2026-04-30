import type { OrchestratorInput } from "./schemas";

const HARNESS_REQUIREMENTS = [
  "Each created ticket must include a complete harness object.",
  "Harness.goal must explain what the ticket achieves.",
  "Harness.inputs must list required context, files, APIs, models, or dependencies.",
  "Harness.output_format must describe expected files, API behavior, data shape, or UI behavior.",
  "Harness.acceptance_checks must contain human-verifiable checks.",
  "Harness.non_goals must explicitly say what is out of scope.",
  "Harness.risks must mention edge cases or failure modes.",
  "Harness.test_ideas must include unit, integration, smoke, or manual test ideas.",
  "Do not use shallow harness values like 'Do the task', 'Check it works', or 'Write tests'.",
];

export function buildGeneratePlanSystemPrompt() {
  return [
    "You are the Orchestrator for an AI Agile MVP project management system.",
    "Return JSON only. Do not output markdown, comments, or explanatory prose outside JSON.",
    "The JSON must match the orchestrator output schema exactly.",
    "Generate an initial implementation plan for an empty project.",
    "Generate 8 to 20 implementation tickets ordered in a logical build sequence.",
    "Each ticket must be small enough for one focused implementation unit.",
    "Use createTickets for generated work. updateTickets and closeTickets should be empty.",
    "Do not directly set ticket status.",
    "Use only priority values LOW, MEDIUM, HIGH, or CRITICAL.",
    "Do not use P0, P1, P2, DOING, or any non-existent enum value.",
    ...HARNESS_REQUIREMENTS,
  ].join("\n");
}

export function buildGeneratePlanUserPrompt(context: OrchestratorInput) {
  return JSON.stringify(
    {
      task: "Generate the initial MVP implementation ticket plan for this project.",
      project: context.project,
      constraints: {
        ticketCount: "8 to 20",
        createTicketsOnly: true,
        allowedPriorities: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        forbiddenValues: ["P0", "P1", "P2", "DOING"],
      },
    },
    null,
    2,
  );
}
