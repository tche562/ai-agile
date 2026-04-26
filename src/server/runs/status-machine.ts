import { RunStatus } from "@prisma/client";

const TERMINAL_RUN_STATUSES = new Set<RunStatus>([
  RunStatus.SUCCEEDED,
  RunStatus.FAILED,
  RunStatus.CANCELED,
]);

const ALLOWED_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  [RunStatus.PENDING]: [
    RunStatus.RUNNING,
    RunStatus.SUCCEEDED,
    RunStatus.FAILED,
    RunStatus.CANCELED,
  ],
  [RunStatus.RUNNING]: [RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELED],
  [RunStatus.SUCCEEDED]: [],
  [RunStatus.FAILED]: [],
  [RunStatus.CANCELED]: [],
};

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

export function canTransitionRunStatus(current: RunStatus, next: RunStatus): boolean {
  if (current === next) {
    return true;
  }

  return ALLOWED_TRANSITIONS[current].includes(next);
}
