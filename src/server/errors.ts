import "server-only";

export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CRITERION_LIMIT"
  | "PAYLOAD_TOO_LARGE"
  | "FORBIDDEN_ORIGIN"
  | "TEST_MAPPING_INVALID"
  | "PREREQUISITE_FAILED"
  | "STORAGE_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly status: number,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface ErrorBody {
  error: { code: AppErrorCode; message: string; details: Record<string, unknown> };
}

/** Sanitized error body: no stack traces, no raw internal messages (SEC-009). */
export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "Internal error.", details: {} } },
  };
}
