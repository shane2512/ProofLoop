import { vi } from "vitest";
import type { Criterion, KaneSnapshot, Project, RunDetail, RunSummary } from "@/lib/api-types";

// Label: ProofLoop application test double. It stands in for the local HTTP API in component tests.
// Nothing here is a Kane result, and no test using it may be reported as Kane verification.

export interface Reply {
  status?: number;
  json?: unknown;
  text?: string;
}
export type Handler = (call: { method: string; path: string; query: URLSearchParams; body: unknown; match: RegExpMatchArray }) => Reply | Promise<Reply>;

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

export class FakeApi {
  private routes: Array<{ method: string; re: RegExp; handler: Handler }> = [];
  readonly calls: Call[] = [];

  on(method: string, pattern: RegExp, handler: Handler): this {
    // Later registrations win, so a test can override a default.
    this.routes.unshift({ method, re: pattern, handler });
    return this;
  }

  count(method: string, pattern: RegExp): number {
    return this.calls.filter((c) => c.method === method && pattern.test(c.path)).length;
  }

  install(): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://127.0.0.1:3000");
        const method = (init?.method ?? "GET").toUpperCase();
        const path = url.pathname.replace(/^\/api\/v1/, "");
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        this.calls.push({ method, path: path + url.search, body });
        for (const r of this.routes) {
          if (r.method !== method) continue;
          const match = path.match(r.re);
          if (!match) continue;
          const reply = await r.handler({ method, path, query: url.searchParams, body, match });
          const status = reply.status ?? 200;
          if (reply.text !== undefined) return new Response(reply.text, { status, headers: { "content-type": "text/plain" } });
          if (status === 204) return new Response(null, { status });
          return new Response(JSON.stringify(reply.json ?? {}), { status, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: `Unhandled test route ${method} ${path}` } }), { status: 500 });
      }),
    );
  }
}

export const apiError = (status: number, code: string, message: string, details: Record<string, unknown> = {}): Reply => ({
  status,
  json: { error: { code, message, details } },
});

const T0 = "2026-11-25T10:00:00.000Z";

export function project(over: Partial<Project> = {}): Project {
  return { id: "p1", name: "Demo Shop", targetUrl: "https://www.saucedemo.com/", notes: null, createdAt: T0, updatedAt: T0, archivedAt: null, ...over };
}

export function criterion(over: Partial<Criterion> = {}): Criterion {
  return {
    id: "c1",
    projectId: "p1",
    title: "Login reaches inventory",
    expectedBehavior: "A valid user reaches the inventory page.",
    notes: null,
    testFile: "p1/login_test.md",
    stepLabel: null,
    position: 0,
    status: "UNVERIFIED",
    statusNote: null,
    lastRunId: null,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    ...over,
  };
}

export function runSummary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "r1",
    projectId: "p1",
    criterionId: "c1",
    criterionSnapshot: {
      projectName: "Demo Shop",
      targetUrl: "https://www.saucedemo.com/",
      title: "Login reaches inventory",
      expectedBehavior: "A valid user reaches the inventory page.",
      notes: null,
      testFile: "p1/login_test.md",
      stepLabel: null,
    },
    status: "RUNNING",
    exitCode: null,
    signal: null,
    timedOut: false,
    canceled: false,
    summary: null,
    errorCode: null,
    durationMs: null,
    startedAt: T0,
    finishedAt: null,
    stdoutTruncated: false,
    stderrTruncated: false,
    evidenceAvailable: false,
    createdAt: T0,
    ...over,
  };
}

export function runDetail(over: Partial<RunSummary> = {}, extra: Partial<RunDetail> = {}): RunDetail {
  return { run: runSummary(over), events: [], evidence: [], kane: null, command: null, ...extra };
}

export function kane(over: Partial<KaneSnapshot> = {}): KaneSnapshot {
  return {
    parserVersion: "kane-testmd-ndjson/1",
    streamStarted: true,
    cliVersion: "0.10.9",
    done: { overallStatus: "passed", durationS: 12, sessionId: null },
    summary: {
      overallStatus: "passed",
      durationS: 12,
      stepsTotal: 2,
      stepsPassed: 2,
      stepsFailed: 0,
      stepsSkipped: 0,
      replayDecisions: null,
      authorDecisions: null,
      uploadPerformed: true,
      uploadSucceeded: true,
      committed: null,
      cancelled: null,
    },
    evidenceId: null,
    evidenceIngestStatus: null,
    steps: [{ index: 1, heading: "Open the login page", status: "passed", durationS: 3 }],
    assertions: [],
    failure: null,
    creditsConsumed: null,
    eventCount: 10,
    malformedLineCount: 0,
    unknownEventTypes: {},
    ...over,
  };
}
