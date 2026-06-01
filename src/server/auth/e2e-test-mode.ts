const DEFAULT_E2E_TEST_USER_EMAIL = "e2e.user@ai-agile.local";
const DEFAULT_E2E_TEST_USER_NAME = "E2E Test User";

function readTrimmedEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : null;
}

function assertE2ETestModeSafety() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("E2E_TEST_MODE must never be enabled in production.");
  }
}

export function isE2ETestModeEnabled(): boolean {
  return process.env.E2E_TEST_MODE === "true";
}

export function getE2ETestUserIdentity(): { email: string; name: string } {
  assertE2ETestModeSafety();

  return {
    email: readTrimmedEnv("E2E_TEST_USER_EMAIL") ?? DEFAULT_E2E_TEST_USER_EMAIL,
    name: readTrimmedEnv("E2E_TEST_USER_NAME") ?? DEFAULT_E2E_TEST_USER_NAME,
  };
}
