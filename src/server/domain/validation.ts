import { AppError } from "../errors";
import { validateTargetUrl } from "../security/url";
import { validateTestFileSyntax } from "../security/paths";

export const LIMITS = {
  projectName: 80,
  criterionTitle: 120,
  expectedBehavior: 2000,
  notes: 2000,
  stepLabel: 120,
  maxActiveCriteria: 5,
} as const;

function invalid(field: string, message: string): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, { field });
}

function asRecord(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError("VALIDATION_ERROR", "Request body must be a JSON object.", 400);
  }
  const rec = body as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!allowed.includes(key)) throw invalid(key, `Unknown field: ${key}.`);
  }
  return rec;
}

function requiredText(rec: Record<string, unknown>, field: string, min: number, max: number): string {
  const v = rec[field];
  if (typeof v !== "string") throw invalid(field, `${field} must be a string.`);
  const t = v.trim();
  if (t.length < min) throw invalid(field, `${field} is required.`);
  if (t.length > max) throw invalid(field, `${field} must be at most ${max} characters.`);
  return t;
}

/** Optional text: undefined = absent, null or empty string = cleared (null). */
function optionalText(rec: Record<string, unknown>, field: string, max: number): string | null | undefined {
  if (!(field in rec)) return undefined;
  const v = rec[field];
  if (v === null) return null;
  if (typeof v !== "string") throw invalid(field, `${field} must be a string or null.`);
  const t = v.trim();
  if (t.length === 0) return null;
  if (t.length > max) throw invalid(field, `${field} must be at most ${max} characters.`);
  return t;
}

export interface ProjectCreateInput {
  name: string;
  targetUrl: string;
  notes: string | null;
}
export interface ProjectPatchInput {
  name?: string;
  targetUrl?: string;
  notes?: string | null;
}

export function parseProjectCreate(body: unknown): ProjectCreateInput {
  const rec = asRecord(body, ["name", "targetUrl", "notes"]);
  const name = requiredText(rec, "name", 1, LIMITS.projectName);
  const targetUrl = validateTargetUrl(rec.targetUrl);
  const notes = optionalText(rec, "notes", LIMITS.notes) ?? null;
  return { name, targetUrl, notes };
}

export function parseProjectPatch(body: unknown): ProjectPatchInput {
  const rec = asRecord(body, ["name", "targetUrl", "notes"]);
  const out: ProjectPatchInput = {};
  if ("name" in rec) out.name = requiredText(rec, "name", 1, LIMITS.projectName);
  if ("targetUrl" in rec) out.targetUrl = validateTargetUrl(rec.targetUrl);
  const notes = optionalText(rec, "notes", LIMITS.notes);
  if (notes !== undefined) out.notes = notes;
  if (Object.keys(out).length === 0) throw new AppError("VALIDATION_ERROR", "Patch must change at least one field.", 400);
  return out;
}

export interface CriterionCreateInput {
  title: string;
  expectedBehavior: string;
  notes: string | null;
  testFile: string;
  stepLabel: string | null;
}
export interface CriterionPatchInput {
  title?: string;
  expectedBehavior?: string;
  notes?: string | null;
  testFile?: string;
  stepLabel?: string | null;
}

const CRITERION_FIELDS = ["title", "expectedBehavior", "notes", "testFile", "stepLabel"] as const;

export function parseCriterionCreate(body: unknown): CriterionCreateInput {
  const rec = asRecord(body, CRITERION_FIELDS);
  return {
    title: requiredText(rec, "title", 1, LIMITS.criterionTitle),
    expectedBehavior: requiredText(rec, "expectedBehavior", 1, LIMITS.expectedBehavior),
    notes: optionalText(rec, "notes", LIMITS.notes) ?? null,
    testFile: validateTestFileSyntax(rec.testFile),
    stepLabel: optionalText(rec, "stepLabel", LIMITS.stepLabel) ?? null,
  };
}

export function parseCriterionPatch(body: unknown): CriterionPatchInput {
  const rec = asRecord(body, CRITERION_FIELDS);
  const out: CriterionPatchInput = {};
  if ("title" in rec) out.title = requiredText(rec, "title", 1, LIMITS.criterionTitle);
  if ("expectedBehavior" in rec) out.expectedBehavior = requiredText(rec, "expectedBehavior", 1, LIMITS.expectedBehavior);
  if ("testFile" in rec) out.testFile = validateTestFileSyntax(rec.testFile);
  const notes = optionalText(rec, "notes", LIMITS.notes);
  if (notes !== undefined) out.notes = notes;
  const step = optionalText(rec, "stepLabel", LIMITS.stepLabel);
  if (step !== undefined) out.stepLabel = step;
  if (Object.keys(out).length === 0) throw new AppError("VALIDATION_ERROR", "Patch must change at least one field.", 400);
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed IDs are reported as NOT_FOUND so callers cannot probe for formats. */
export function requireId(value: string, what: string): string {
  if (!UUID_RE.test(value)) throw new AppError("NOT_FOUND", `${what} not found.`, 404);
  return value.toLowerCase();
}
