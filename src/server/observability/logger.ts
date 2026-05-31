type RuntimeLogLevel = "error" | "warn" | "info";

type RuntimeLogContext = Record<string, unknown>;

type RuntimeLogInput = {
  event: string;
  message?: string;
  context?: RuntimeLogContext;
  error?: unknown;
};

type NormalizedErrorForLog = {
  errorName: string;
  errorMessage: string;
  errorCode?: string;
  statusCode?: number;
  stack?: string;
};

const SENSITIVE_KEY_PATTERN =
  /api[-_]?key|secret|token|cookie|authorization|password|prompt|raw(text|output)|session/i;
const MAX_STRING_LENGTH = 300;
const MAX_RECURSION_DEPTH = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStatusCode(errorRecord: Record<string, unknown>): number | undefined {
  const directStatus = readNumber(errorRecord.statusCode) ?? readNumber(errorRecord.status);
  if (directStatus !== undefined) {
    return directStatus;
  }

  const nestedError = errorRecord.error;
  if (!isRecord(nestedError)) {
    return undefined;
  }

  return readNumber(nestedError.statusCode) ?? readNumber(nestedError.status);
}

function readErrorCode(errorRecord: Record<string, unknown>): string | undefined {
  const directCode = readString(errorRecord.code);
  if (directCode) {
    return directCode;
  }

  const nestedError = errorRecord.error;
  if (!isRecord(nestedError)) {
    return undefined;
  }

  return readString(nestedError.code);
}

export function normalizeErrorForLog(error: unknown): NormalizedErrorForLog {
  if (error instanceof Error) {
    const errorWithFields = error as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };

    return {
      errorName: error.name || "Error",
      errorMessage: truncateString(error.message || "Unknown error"),
      errorCode: readString(errorWithFields.code),
      statusCode: readNumber(errorWithFields.statusCode) ?? readNumber(errorWithFields.status),
      ...(process.env.NODE_ENV !== "production" && error.stack
        ? { stack: truncateString(error.stack) }
        : {}),
    };
  }

  if (typeof error === "string") {
    return {
      errorName: "UnknownError",
      errorMessage: truncateString(error),
    };
  }

  if (isRecord(error)) {
    return {
      errorName: readString(error.name) ?? "UnknownError",
      errorMessage: truncateString(readString(error.message) ?? "Unknown error"),
      errorCode: readErrorCode(error),
      statusCode: readStatusCode(error),
    };
  }

  return {
    errorName: "UnknownError",
    errorMessage: "Unknown error",
  };
}

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  currentKey?: string,
): unknown {
  if (currentKey && SENSITIVE_KEY_PATTERN.test(currentKey)) {
    return "[REDACTED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return normalizeErrorForLog(value);
  }

  if (depth >= MAX_RECURSION_DEPTH) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1, seen));
  }

  if (!isRecord(value)) {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[key] = sanitizeValue(nestedValue, depth + 1, seen, key);
  }

  return sanitized;
}

export function redactLogContext(context: RuntimeLogContext): RuntimeLogContext {
  const seen = new WeakSet<object>();
  return sanitizeValue(context, 0, seen) as RuntimeLogContext;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined);
  return Object.fromEntries(entries) as T;
}

function emitRuntimeLog(level: RuntimeLogLevel, input: RuntimeLogInput) {
  const safeContext = input.context ? redactLogContext(input.context) : {};
  const safeError = input.error ? normalizeErrorForLog(input.error) : {};

  const payload = stripUndefined({
    timestamp: new Date().toISOString(),
    level,
    event: input.event,
    message: input.message ?? "Runtime event",
    ...safeContext,
    ...safeError,
  });

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.info(payload);
}

export function logRuntimeError(input: RuntimeLogInput) {
  emitRuntimeLog("error", input);
}

export function logRuntimeWarning(input: RuntimeLogInput) {
  emitRuntimeLog("warn", input);
}

export function logRuntimeInfo(input: RuntimeLogInput) {
  emitRuntimeLog("info", input);
}

export type { RuntimeLogInput };
