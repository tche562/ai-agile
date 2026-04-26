import { RunStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { canTransitionRunStatus, isTerminalRunStatus } from "./status-machine";

describe("run status machine", () => {
  it("allows idempotent status updates", () => {
    expect(canTransitionRunStatus(RunStatus.RUNNING, RunStatus.RUNNING)).toBe(true);
  });

  it("allows pending to running and terminal statuses", () => {
    expect(canTransitionRunStatus(RunStatus.PENDING, RunStatus.RUNNING)).toBe(true);
    expect(canTransitionRunStatus(RunStatus.PENDING, RunStatus.SUCCEEDED)).toBe(true);
    expect(canTransitionRunStatus(RunStatus.PENDING, RunStatus.FAILED)).toBe(true);
    expect(canTransitionRunStatus(RunStatus.PENDING, RunStatus.CANCELED)).toBe(true);
  });

  it("blocks transitions from terminal statuses", () => {
    expect(canTransitionRunStatus(RunStatus.SUCCEEDED, RunStatus.RUNNING)).toBe(false);
    expect(canTransitionRunStatus(RunStatus.FAILED, RunStatus.PENDING)).toBe(false);
    expect(canTransitionRunStatus(RunStatus.CANCELED, RunStatus.SUCCEEDED)).toBe(false);
  });

  it("marks terminal statuses correctly", () => {
    expect(isTerminalRunStatus(RunStatus.SUCCEEDED)).toBe(true);
    expect(isTerminalRunStatus(RunStatus.FAILED)).toBe(true);
    expect(isTerminalRunStatus(RunStatus.CANCELED)).toBe(true);
    expect(isTerminalRunStatus(RunStatus.PENDING)).toBe(false);
    expect(isTerminalRunStatus(RunStatus.RUNNING)).toBe(false);
  });
});
