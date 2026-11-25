import type { EvidenceRefDto, RunSummaryDto } from "../verification";
import type { KaneStreamSnapshot } from "../kane/parser";
import { asKaneSnapshot, describeCommand, fenced, formatMs, RUN_STATUS_TEXT, tailExcerpt } from "./common";

export interface ReportInput {
  run: RunSummaryDto;
  /** The stored parser snapshot. Null when the run never produced one. */
  kane: unknown;
  evidence: EvidenceRefDto[];
  command: string[] | null;
  /** Saved (already redacted) output. Null when none was saved. */
  stdout: string | null;
  stderr: string | null;
}

const na = (reason: string) => `Not available (${reason})`;

/**
 * Builds the Markdown handoff report for one finished run (FR-017). It is a pure function of the stored
 * record: the same input always gives the same text. Every statement comes from a recorded field, and
 * anything that was not recorded is listed under "Not recorded" instead of being filled in.
 */
export function buildAgentReportMarkdown(input: ReportInput): string {
  const { run, evidence } = input;
  const kane: KaneStreamSnapshot | null = asKaneSnapshot(input.kane);
  const snap = run.criterionSnapshot;
  const missing: string[] = [];
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);

  push(
    "# ProofLoop verification report",
    "",
    "ProofLoop generated this from one stored run record. It states what was recorded and labels what was not. ProofLoop did not send it anywhere: a person chose to copy or download it.",
    "",
    "## Project and criterion",
    "",
    `- Project: ${snap.projectName}`,
    `- Target URL: ${snap.targetUrl}`,
    `- Criterion: ${snap.title}`,
    `- Expected behavior: ${snap.expectedBehavior}`,
    `- Test step: ${snap.stepLabel ?? "Not set"}`,
    `- Notes: ${snap.notes ?? "None"}`,
    `- Test file: \`${snap.testFile}\` (inside the project's ProofLoop test folder)`,
    "",
    "## Result",
    "",
    `- Run ID: ${run.id}`,
    `- ProofLoop run status: **${run.status}**. ${RUN_STATUS_TEXT[run.status]}`,
  );

  if (run.exitCode === null) missing.push("Exit code (the process did not report one)");
  push(`- Exit code: ${run.exitCode === null ? na("the process did not report one") : run.exitCode}`);
  push(`- Signal: ${run.signal ?? "None"}`);
  push(`- Timed out: ${run.timedOut ? "yes" : "no"}`, `- Canceled: ${run.canceled ? "yes" : "no"}`);
  if (run.durationMs === null) missing.push("Duration");
  push(`- Duration: ${formatMs(run.durationMs)}`, `- Started: ${run.startedAt ?? na("the run never started")}`, `- Finished: ${run.finishedAt ?? na("the run did not finish")}`);
  push(`- ProofLoop error code: ${run.errorCode ?? "None"}`);
  if (run.summary) push(`- ProofLoop summary: ${run.summary}`);

  if (kane?.done) {
    push(`- Kane's final result event: ${kane.done.overallStatus ?? na("the event carried no status")}`);
  } else {
    missing.push("Kane's final result event");
    push(`- Kane's final result event: ${na("Kane did not send one")}`);
  }
  if (kane?.cliVersion) push(`- Kane CLI version: ${kane.cliVersion}`);

  push("", "## Steps reported by Kane", "");
  if (kane && kane.steps.length > 0) {
    kane.steps.forEach((s, i) => push(`${i + 1}. [${s.status ?? "status not recorded"}] ${s.heading ?? `Step ${s.index}`}${s.durationS !== null ? ` (${s.durationS} s)` : ""}`));
  } else {
    missing.push("Per-step results");
    push("No step results were recorded.");
  }
  if (kane && kane.assertions.length > 0) {
    push("", "Assertions reported by Kane:", "");
    for (const a of kane.assertions) push(`- [${a.passed === null ? "result not recorded" : a.passed ? "passed" : "failed"}] ${a.detail ?? "(no detail)"}`);
  }

  push("", "## Kane's own diagnosis", "", "These are Kane's statements. ProofLoop has not checked them.", "");
  const f = kane?.failure ?? null;
  if (f && (f.reason || f.summary || f.oneLiner || f.kaneVerdict)) {
    if (f.reason) push(`- Reason: ${f.reason}`);
    if (f.reasonCode) push(`- Reason code: ${f.reasonCode}`);
    if (f.summary) push(`- Summary: ${f.summary}`);
    if (f.oneLiner) push(`- One line: ${f.oneLiner}`);
    if (f.kaneVerdict?.rootCause) push(`- Likely cause, per Kane: ${f.kaneVerdict.rootCause}`);
    if (f.kaneVerdict?.suggestion) push(`- Suggestion, per Kane: ${f.kaneVerdict.suggestion}`);
  } else {
    push("Kane did not report a failure diagnosis for this run.");
  }

  push("", "## Output excerpt", "", "The last lines of what Kane wrote, unfiltered. Full output is only in the JSON export, and only if the person asks for it.", "");
  for (const [name, text, truncated] of [
    ["stdout", input.stdout, run.stdoutTruncated],
    ["stderr", input.stderr, run.stderrTruncated],
  ] as const) {
    push(`### ${name}`, "");
    if (text === null) {
      missing.push(`Saved ${name}`);
      push(na("no output was saved for this run"), "");
    } else {
      const ex = tailExcerpt(text);
      if (ex.totalLines === 0) push("The stream was empty.", "");
      else push(`Last ${ex.shownLines} of ${ex.totalLines} non-empty lines${truncated ? " (ProofLoop stopped saving this stream at its size limit)" : ""}:`, "", fenced(ex.text), "");
    }
  }

  push("## Evidence", "");
  if (evidence.length === 0) {
    missing.push("Evidence files");
    push("No evidence was recorded for this run.");
  } else {
    push("Files ProofLoop confirmed on this machine, under its evidence folder. Open them from the ProofLoop dashboard; they are not part of this report.", "");
    for (const e of evidence) push(e.available && e.relativePath ? `- ${e.label}: \`${e.relativePath}\` (available)` : `- ${e.label}: not available. ${e.unavailableReason ?? "No reason recorded."}`);
  }

  const cmd = describeCommand(input.command);
  push("", "## Command", "");
  if (cmd) push(`\`${cmd}\``);
  else {
    missing.push("Kane command (no process was started)");
    push(na("no process was started"));
  }

  push("", "## What to do with this report", "");
  if (run.status === "PASSED") {
    push(
      "- This run passed. No fix is requested.",
      "- A pass covers only the criterion above, run once against the target above. It does not show that anything else works.",
    );
  } else if (run.status === "FAILED") {
    push(
      "- Read the criterion, the steps and the output above, then find the smallest change in the application that would make the expected behavior hold.",
      "- Propose a minimal fix and say why you think it addresses the observed result. Do not rewrite unrelated code.",
      "- Do not edit the Kane test file to make it pass unless you can show the criterion itself is wrong.",
      "- A person will review your change and start a new run in ProofLoop. Do not claim the criterion is verified: only a new passing Kane run can do that.",
    );
  } else {
    push(
      `- This run's status is ${run.status}, so no pass or fail was established for the criterion.`,
      "- Do not treat it as a defect in the application. Look at the status, error code and output above for what stopped the run, and ask the person to re-run once that is resolved.",
    );
  }

  push("", "## Not recorded", "");
  if (missing.length === 0) push("Nothing above was missing from the record.");
  else for (const m of missing) push(`- ${m}`);

  return `${out.join("\n")}\n`;
}
