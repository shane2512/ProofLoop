// @vitest-environment jsdom
import "./setup-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompareSection } from "@/components/workspace/CompareSection";
import { ProjectView } from "@/components/workspace/ProjectView";
import { ReportSection } from "@/components/workspace/ReportSection";
import { RunPanel } from "@/components/workspace/RunPanel";
import { apiError, criterion, FakeApi, kane, project, runDetail, runSummary } from "./helpers/fake-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const REPORT = "# ProofLoop verification report\n\n- Exit code: 1\n";

describe("ReportSection (handoff)", () => {
  let api: FakeApi;
  beforeEach(() => {
    api = new FakeApi();
    api.install();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the report the server built, and says ProofLoop sends it nowhere", async () => {
    api.on("GET", /^\/runs\/r1\/report$/, () => ({ text: REPORT }));
    render(<ReportSection runId="r1" />);
    const box = (await screen.findByLabelText("Report text")) as HTMLTextAreaElement;
    expect(box.value).toBe(REPORT);
    expect(box.readOnly).toBe(true);
    expect(screen.getByText(/does not send it anywhere/)).toBeTruthy();
    expect(api.calls.filter((c) => c.path.includes("format=markdown"))).toHaveLength(1);
  });

  it("copies the report to the clipboard on request only", async () => {
    api.on("GET", /^\/runs\/r1\/report$/, () => ({ text: REPORT }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<ReportSection runId="r1" />);
    await screen.findByLabelText("Report text");
    expect(writeText).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Copy report" }));
    expect(writeText).toHaveBeenCalledWith(REPORT);
    expect(await screen.findByText("Copied to the clipboard.")).toBeTruthy();
  });

  it("falls back to selecting the text when the browser blocks the clipboard", async () => {
    api.on("GET", /^\/runs\/r1\/report$/, () => ({ text: REPORT }));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<ReportSection runId="r1" />);
    const box = (await screen.findByLabelText("Report text")) as HTMLTextAreaElement;
    await userEvent.click(screen.getByRole("button", { name: "Copy report" }));
    expect(await screen.findByText(/blocked copying.*Ctrl\+C/)).toBeTruthy();
    expect(document.activeElement).toBe(box);
    expect(box.selectionStart).toBe(0);
    expect(box.selectionEnd).toBe(REPORT.length);
  });

  it("falls back the same way when there is no clipboard API at all", async () => {
    api.on("GET", /^\/runs\/r1\/report$/, () => ({ text: REPORT }));
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    render(<ReportSection runId="r1" />);
    await screen.findByLabelText("Report text");
    await userEvent.click(screen.getByRole("button", { name: "Copy report" }));
    expect(await screen.findByText(/blocked copying/)).toBeTruthy();
  });

  it("offers downloads as plain links, with raw output only behind its own explicit link", async () => {
    api.on("GET", /^\/runs\/r1\/report$/, () => ({ text: REPORT }));
    render(<ReportSection runId="r1" />);
    await screen.findByLabelText("Report text");
    expect(screen.getByRole("link", { name: "Download Markdown" }).getAttribute("href")).toBe("/api/v1/runs/r1/report?format=markdown");
    expect(screen.getByRole("link", { name: "Download JSON" }).getAttribute("href")).toBe("/api/v1/runs/r1/report?format=json");
    const raw = screen.getByRole("link", { name: "Download JSON with raw output" });
    expect(raw.getAttribute("href")).toBe("/api/v1/runs/r1/report?format=json&includeOutput=true");
    expect(raw.closest("details")?.textContent).toContain("full stdout and stderr");
    for (const name of ["Download Markdown", "Download JSON"]) expect(screen.getByRole("link", { name }).getAttribute("href")).not.toContain("includeOutput");
  });

  it("shows why a report could not be built and lets the person retry", async () => {
    let fail = true;
    api.on("GET", /^\/runs\/r1\/report$/, () => (fail ? apiError(409, "CONFLICT", "The run is still in progress. A report needs a finished run.") : { text: REPORT }));
    render(<ReportSection runId="r1" />);
    expect((await screen.findByRole("alert")).textContent).toContain("still in progress");
    expect(screen.queryByRole("button", { name: "Copy report" })).toBeNull();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Report text")).toBeTruthy();
  });
});

describe("CompareSection", () => {
  let api: FakeApi;
  const run = runSummary({ id: "r2", status: "PASSED", exitCode: 0, createdAt: "2026-11-25T11:00:00.000Z" });
  beforeEach(() => {
    api = new FakeApi();
    api.install();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says so when there is nothing to compare with", async () => {
    api.on("GET", /^\/projects\/p1\/runs$/, () => ({ json: { runs: [run], nextCursor: null } }));
    render(<CompareSection run={run} />);
    expect(await screen.findByText(/no other finished run of this criterion/)).toBeTruthy();
  });

  it("offers only other finished runs, and compares the earlier run first whichever was chosen", async () => {
    const older = runSummary({ id: "r1", status: "FAILED", exitCode: 1, createdAt: "2026-11-25T10:00:00.000Z" });
    const active = runSummary({ id: "r3", status: "RUNNING", createdAt: "2026-11-25T12:00:00.000Z" });
    api.on("GET", /^\/projects\/p1\/runs$/, () => ({ json: { runs: [active, run, older], nextCursor: null } }));
    api.on("GET", /^\/runs\/compare$/, ({ query }) => ({
      json: {
        a: { id: query.get("a"), status: "FAILED", exitCode: 1, kaneFinalStatus: "failed", startedAt: "2026-11-25T10:00:00.000Z", durationMs: 9000, stepsPassed: 0, stepsFailed: 1, summary: "x", expectedBehavior: "E", testFile: "t", evidence: [], timedOut: false, canceled: false, errorCode: "EXIT_NONZERO", createdAt: "", finishedAt: null },
        b: { id: query.get("b"), status: "PASSED", exitCode: 0, kaneFinalStatus: "passed", startedAt: "2026-11-25T11:00:00.000Z", durationMs: 8000, stepsPassed: 1, stepsFailed: 0, summary: "y", expectedBehavior: "E", testFile: "t", evidence: [{ id: "e", label: "Kane evidence pack", available: true, relativePath: "p", unavailableReason: null }], timedOut: false, canceled: false, errorCode: null, createdAt: "", finishedAt: null },
        differences: [{ field: "status", a: "FAILED", b: "PASSED" }, { field: "exitCode", a: 1, b: 0 }],
        note: "These are the recorded differences between two runs. ProofLoop does not infer what caused them.",
      },
    }));
    render(<CompareSection run={run} />);
    const select = (await screen.findByLabelText("Other run of this criterion")) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(2)); // placeholder + the one finished other run
    await userEvent.selectOptions(select, "r1");
    const table = await screen.findByRole("region", { name: "Run comparison" });
    expect(api.calls.find((c) => c.path.startsWith("/runs/compare"))?.path).toBe("/runs/compare?a=r1&b=r2");
    const status = within(table).getByRole("row", { name: /Status/ });
    expect(within(status).getAllByRole("cell").map((c) => c.textContent)).toEqual(["FAILED", "PASSED"]);
    expect(within(status).getByText("(differs)")).toBeTruthy();
    expect(within(table).getByText(/Kane evidence pack: available/)).toBeTruthy();
    expect(within(table).getByText(/does not infer what caused them/)).toBeTruthy();
    expect(table.textContent).not.toMatch(/because|fixed by/i);
  });

  it("warns when the two runs did not check the same expected behavior or test file", async () => {
    const other = runSummary({ id: "r1", status: "FAILED", createdAt: "2026-11-25T10:00:00.000Z" });
    api.on("GET", /^\/projects\/p1\/runs$/, () => ({ json: { runs: [run, other], nextCursor: null } }));
    const facts = { id: "", status: "PASSED", exitCode: 0, timedOut: false, canceled: false, errorCode: null, summary: null, createdAt: "", startedAt: null, finishedAt: null, durationMs: null, kaneFinalStatus: null, stepsPassed: null, stepsFailed: null, expectedBehavior: "E", testFile: "t", evidence: [] };
    api.on("GET", /^\/runs\/compare$/, () => ({ json: { a: facts, b: { ...facts, expectedBehavior: "Changed" }, differences: [{ field: "expectedBehavior", a: "E", b: "Changed" }], note: "n" } }));
    render(<CompareSection run={run} />);
    await userEvent.selectOptions(await screen.findByLabelText("Other run of this criterion"), "r1");
    expect(await screen.findByText(/did not check exactly the same thing/)).toBeTruthy();
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
  });

  it("shows a comparison failure", async () => {
    const other = runSummary({ id: "r1", status: "FAILED", createdAt: "2026-11-25T10:00:00.000Z" });
    api.on("GET", /^\/projects\/p1\/runs$/, () => ({ json: { runs: [run, other], nextCursor: null } }));
    api.on("GET", /^\/runs\/compare$/, () => apiError(400, "VALIDATION_ERROR", "Only runs of the same criterion can be compared.", { field: "b" }));
    render(<CompareSection run={run} />);
    await userEvent.selectOptions(await screen.findByLabelText("Other run of this criterion"), "r1");
    expect((await screen.findByRole("alert")).textContent).toContain("Only runs of the same criterion");
  });
});

describe("run panel handoff integration", () => {
  let api: FakeApi;
  beforeEach(() => {
    api = new FakeApi();
    api.install();
    api.on("GET", /^\/projects\/p1\/runs$/, () => ({ json: { runs: [], nextCursor: null } }));
    api.on("GET", /^\/runs\/r1\/report$/, () => ({ text: REPORT }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the report, compare and an evidence download for a finished run, and none of them while it runs", async () => {
    api.on("GET", /^\/runs\/r1$/, () =>
      ({ json: runDetail({ status: "FAILED", exitCode: 1, finishedAt: "2026-11-25T10:00:12.000Z" }, { kane: kane(), evidence: [{ id: "ev1", kind: "EVIDENCE_PACK", label: "Kane evidence pack", available: true, source: "s", relativePath: "r1/x.evidence", unavailableReason: null }] }) }),
    );
    render(<RunPanel runId="r1" onSettled={() => {}} onClose={() => {}} />);
    expect(await screen.findByLabelText("Report text")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Download Kane evidence pack" }).getAttribute("href")).toBe("/api/v1/runs/r1/evidence/ev1");
    expect(await screen.findByText(/no other finished run/)).toBeTruthy();
  });

  it("offers no download for evidence that is not available", async () => {
    api.on("GET", /^\/runs\/r1$/, () =>
      ({ json: runDetail({ status: "FAILED", exitCode: 1, finishedAt: "x" }, { evidence: [{ id: "ev1", kind: "EVIDENCE_PACK", label: "Kane evidence pack", available: false, source: "s", relativePath: null, unavailableReason: "No longer on disk." }] }) }),
    );
    render(<RunPanel runId="r1" onSettled={() => {}} onClose={() => {}} />);
    await screen.findByText("No longer on disk.");
    expect(screen.queryByRole("link", { name: /Download Kane evidence pack/ })).toBeNull();
  });

  it("does not request a report while the run is still active", async () => {
    api.on("GET", /^\/runs\/r1$/, () => ({ json: runDetail({ status: "RUNNING" }) }));
    render(<RunPanel runId="r1" onSettled={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Running"));
    expect(screen.queryByLabelText("Report text")).toBeNull();
    expect(api.count("GET", /report/)).toBe(0);
  });
});

describe("history filter", () => {
  it("filters run history by criterion when there is more than one", async () => {
    const api = new FakeApi();
    api.install();
    api.on("GET", /^\/projects\/p1$/, () => ({ json: { project: project(), criteria: [criterion({ id: "a", title: "Alpha" }), criterion({ id: "b", title: "Beta" })] } }));
    api.on("GET", /^\/projects\/p1\/runs$/, ({ query }) => ({ json: { runs: query.get("criterionId") === "b" ? [runSummary({ id: "rb", criterionId: "b", status: "PASSED" })] : [runSummary({ id: "ra", status: "FAILED" }), runSummary({ id: "rb", criterionId: "b", status: "PASSED" })], nextCursor: null } }));
    render(<ProjectView projectId="p1" />);
    const filter = (await screen.findByLabelText("Show runs for")) as HTMLSelectElement;
    await userEvent.selectOptions(filter, "b");
    await waitFor(() => expect(api.calls.some((c) => c.path.includes("criterionId=b"))).toBe(true));
    await waitFor(() => expect(document.querySelectorAll(".ws-history-row")).toHaveLength(1));
    vi.unstubAllGlobals();
  });
});
