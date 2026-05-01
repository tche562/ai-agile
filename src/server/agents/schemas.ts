import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const nonEmptyStringArraySchema = z.array(nonEmptyStringSchema);

export const agentRoleSchema = z.enum(["PLANNER", "IMPLEMENTER", "QA"]);

export const agentWorklogStatusSchema = z.enum(["COMPLETED", "NEEDS_FOLLOWUP", "BLOCKED"]);

export const agentReplanSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const agentReplanSignalSchema = z
  .object({
    shouldReplan: z.boolean(),
    reason: nonEmptyStringSchema.optional(),
    severity: agentReplanSeveritySchema,
  })
  .strict();

export const baseAgentOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    role: agentRoleSchema,
    summary: nonEmptyStringSchema,
    status: agentWorklogStatusSchema,
    findings: nonEmptyStringArraySchema,
    risks: nonEmptyStringArraySchema,
    suggestedNextSteps: nonEmptyStringArraySchema,
    replanSignal: agentReplanSignalSchema,
  })
  .strict();

export const plannerAgentOutputSchema = baseAgentOutputSchema
  .extend({
    role: z.literal("PLANNER"),
    planningNotes: nonEmptyStringArraySchema,
    dependencyNotes: nonEmptyStringArraySchema,
    scopeConcerns: nonEmptyStringArraySchema,
    acceptanceCriteriaSuggestions: nonEmptyStringArraySchema,
  })
  .strict();

export const implementerAgentOutputSchema = baseAgentOutputSchema
  .extend({
    role: z.literal("IMPLEMENTER"),
    implementationPlan: nonEmptyStringArraySchema,
    touchedAreas: nonEmptyStringArraySchema,
    technicalRisks: nonEmptyStringArraySchema,
    testSuggestions: nonEmptyStringArraySchema,
  })
  .strict();

export const qaAcceptanceCheckResultSchema = z
  .object({
    check: nonEmptyStringSchema,
    result: z.enum(["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]),
    notes: z.string().optional(),
  })
  .strict();

export const qaAgentOutputSchema = baseAgentOutputSchema
  .extend({
    role: z.literal("QA"),
    testPlan: nonEmptyStringArraySchema,
    edgeCases: nonEmptyStringArraySchema,
    regressionRisks: nonEmptyStringArraySchema,
    acceptanceCheckResults: z.array(qaAcceptanceCheckResultSchema),
  })
  .strict();

export const agentOutputSchema = z.discriminatedUnion("role", [
  plannerAgentOutputSchema,
  implementerAgentOutputSchema,
  qaAgentOutputSchema,
]);

export type AgentRoleValue = z.infer<typeof agentRoleSchema>;
export type AgentWorklogStatus = z.infer<typeof agentWorklogStatusSchema>;
export type AgentReplanSignal = z.infer<typeof agentReplanSignalSchema>;
export type PlannerAgentOutput = z.infer<typeof plannerAgentOutputSchema>;
export type ImplementerAgentOutput = z.infer<typeof implementerAgentOutputSchema>;
export type QaAgentOutput = z.infer<typeof qaAgentOutputSchema>;
export type AgentOutput = z.infer<typeof agentOutputSchema>;

export function parseAgentOutput(input: unknown): AgentOutput {
  return agentOutputSchema.parse(input);
}
