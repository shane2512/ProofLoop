import { AppError } from "../errors";

const MAX_URL_LENGTH = 2048;

function fail(message: string): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, { field: "targetUrl" });
}

/** FR-001, SEC-006: absolute http/https URL, no embedded credentials. Returns the normalized URL. */
export function validateTargetUrl(value: unknown): string {
  if (typeof value !== "string") throw fail("targetUrl must be a string.");
  const trimmed = value.trim();
  if (trimmed.length === 0) throw fail("targetUrl is required.");
  if (trimmed.length > MAX_URL_LENGTH) throw fail(`targetUrl must be at most ${MAX_URL_LENGTH} characters.`);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw fail("targetUrl must be an absolute URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw fail("targetUrl must use http or https.");
  if (url.username !== "" || url.password !== "") throw fail("targetUrl must not contain credentials.");
  if (url.hostname === "") throw fail("targetUrl must include a host.");
  return url.href;
}
