import type {
  ApiErrorBody,
  Criterion,
  CriterionInput,
  Project,
  ProjectInput,
  RunComparison,
  RunDetail,
  RunPage,
  TestFileContent,
  TestFileEntry,
} from "./api-types";

const BASE = "/api/v1";

/** An error returned by the API, or `NETWORK` when no response arrived. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The request field the server rejected, when it named one. */
  get field(): string | null {
    const f = this.details?.field;
    return typeof f === "string" ? f : null;
  }
}

async function readError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    body = null;
  }
  const e = body?.error;
  if (e && typeof e.code === "string" && typeof e.message === "string") {
    return new ApiError(e.code, e.message, res.status, e.details);
  }
  return new ApiError("INTERNAL_ERROR", `The server answered ${res.status} without an error message.`, res.status);
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("NETWORK", "ProofLoop could not be reached.", 0);
  }
  if (!res.ok) throw await readError(res);
  return res;
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = { method, signal };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const res = await send(path, init);
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("INTERNAL_ERROR", "The server sent a response that could not be read.", res.status);
  }
}

const seg = encodeURIComponent;

export const api = {
  listProjects: (signal?: AbortSignal) => request<{ projects: Project[] }>("GET", "/projects", undefined, signal).then((r) => r.projects),
  createProject: (input: ProjectInput) => request<{ project: Project }>("POST", "/projects", input).then((r) => r.project),
  getProject: (projectId: string, signal?: AbortSignal) =>
    request<{ project: Project; criteria: Criterion[] }>("GET", `/projects/${seg(projectId)}`, undefined, signal),
  updateProject: (projectId: string, patch: Partial<ProjectInput>) =>
    request<{ project: Project }>("PATCH", `/projects/${seg(projectId)}`, patch).then((r) => r.project),
  archiveProject: (projectId: string) => request<void>("DELETE", `/projects/${seg(projectId)}`),

  createCriterion: (projectId: string, input: CriterionInput) =>
    request<{ criterion: Criterion }>("POST", `/projects/${seg(projectId)}/criteria`, input).then((r) => r.criterion),
  updateCriterion: (projectId: string, criterionId: string, patch: Partial<CriterionInput>) =>
    request<{ criterion: Criterion }>("PATCH", `/projects/${seg(projectId)}/criteria/${seg(criterionId)}`, patch).then((r) => r.criterion),
  deleteCriterion: (projectId: string, criterionId: string) =>
    request<void>("DELETE", `/projects/${seg(projectId)}/criteria/${seg(criterionId)}`),

  startRun: (projectId: string, criterionId: string) =>
    request<{ runId: string; status: "QUEUED" }>("POST", `/projects/${seg(projectId)}/criteria/${seg(criterionId)}/runs`, {}),
  getRun: (runId: string, signal?: AbortSignal) => request<RunDetail>("GET", `/runs/${seg(runId)}`, undefined, signal),
  cancelRun: (runId: string) => request<{ runId: string; status: "CANCEL_REQUESTED" }>("POST", `/runs/${seg(runId)}/cancel`, {}),
  listRuns: (projectId: string, opts: { criterionId?: string; limit?: number; cursor?: string } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (opts.criterionId) q.set("criterionId", opts.criterionId);
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.cursor) q.set("cursor", opts.cursor);
    const qs = q.toString();
    return request<RunPage>("GET", `/projects/${seg(projectId)}/runs${qs ? `?${qs}` : ""}`, undefined, signal);
  },
  /** Saved, redacted stdout or stderr. Rejects with `OUTPUT_UNAVAILABLE` when nothing was saved. */
  async getRunOutput(runId: string, stream: "stdout" | "stderr", signal?: AbortSignal): Promise<string> {
    const res = await send(`/runs/${seg(runId)}/output?stream=${stream}`, { signal });
    return res.text();
  },

  /** The Markdown handoff report for a finished run. Rejects with CONFLICT while the run is active. */
  async getReportMarkdown(runId: string, signal?: AbortSignal): Promise<string> {
    const res = await send(`/runs/${seg(runId)}/report?format=markdown`, { signal });
    return res.text();
  },
  compareRuns: (a: string, b: string, signal?: AbortSignal) => request<RunComparison>("GET", `/runs/compare?a=${seg(a)}&b=${seg(b)}`, undefined, signal),

  listTestFiles: (projectId: string, signal?: AbortSignal) =>
    request<{ files: TestFileEntry[] }>("GET", `/projects/${seg(projectId)}/test-files`, undefined, signal).then((r) => r.files),
  getTestFile: (projectId: string, name: string, signal?: AbortSignal) =>
    request<{ file: TestFileContent }>("GET", `/projects/${seg(projectId)}/test-files/${seg(name)}`, undefined, signal).then((r) => r.file),
  saveTestFile: (projectId: string, name: string, content: string) =>
    request<{ file: TestFileEntry }>("PUT", `/projects/${seg(projectId)}/test-files/${seg(name)}`, { content }).then((r) => r.file),
};

export interface ErrorMessage {
  title: string;
  /** What the person can do next. */
  remedy: string | null;
}

/** Turns any thrown value into text for the person using the dashboard. */
export function describeApiError(err: unknown): ErrorMessage {
  if (!(err instanceof ApiError)) {
    return { title: "Something went wrong.", remedy: "Reload the page and try again." };
  }
  switch (err.code) {
    case "NETWORK":
      return { title: "ProofLoop could not be reached.", remedy: "Check that the local server is still running (npm start), then retry." };
    case "RUNNER_BUSY":
      return { title: "Another run is already in progress.", remedy: "ProofLoop runs one Kane test at a time. Wait for it to finish or cancel it, then start this one." };
    case "PREREQUISITE_FAILED":
      return {
        title: err.message || "Kane is not ready on this machine.",
        remedy: "Make sure kane-cli is installed and you are logged in (kane-cli whoami), then try again. ProofLoop did not start a run.",
      };
    case "TEST_MAPPING_INVALID":
      return {
        title: err.message || "The mapped test file cannot be used.",
        remedy: "Open the criterion and map it to a test file that exists, or write the file first.",
      };
    case "CRITERION_LIMIT":
      return { title: "A project can hold at most five criteria.", remedy: "Delete a criterion you no longer need, then add this one." };
    case "VALIDATION_ERROR":
      return { title: err.message, remedy: null };
    case "CONFLICT":
      return { title: err.message || "That change conflicts with the current state.", remedy: "Reload and try again." };
    case "RUN_NOT_ACTIVE":
      return { title: "This run has already finished.", remedy: null };
    case "NOT_FOUND":
      return { title: err.message || "That item no longer exists.", remedy: "It may have been removed. Go back to the project list." };
    case "FORBIDDEN_ORIGIN":
      return { title: "The request was blocked because it did not come from this app.", remedy: "Open ProofLoop at its own local address and try again." };
    case "PAYLOAD_TOO_LARGE":
      return { title: "That is too large to save.", remedy: "Shorten the text and try again." };
    case "OUTPUT_UNAVAILABLE":
      return { title: "No output was saved for this run.", remedy: null };
    case "STORAGE_ERROR":
      return { title: "ProofLoop could not read or write its local data.", remedy: "Check disk space and the PROOFLOOP_DATA_DIR folder permissions." };
    default:
      return { title: "ProofLoop hit an internal error.", remedy: "Retry. If it keeps happening, check the server console." };
  }
}
