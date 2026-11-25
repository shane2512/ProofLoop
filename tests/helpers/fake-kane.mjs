// TEST FIXTURE PROCESS. Not Kane. Simulates stdout/stderr/exit behavior to test ProofLoop's
// process supervision. Output from this script can never count as a Kane verification.
import os from "node:os";

const mode = process.argv[2] ?? "pass";
const EVIDENCE_ID = "2ea337ce-92f8-468e-af86-b8a22daa2002";
const line = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const base = (type, extra = {}) => ({ type, v: 1, ts: new Date().toISOString(), ...extra });

function terminal(status) {
  line(base("test_md_evidence_ingest", { status: "ok", evidence_id: EVIDENCE_ID }));
  line(base("test_md_summary", { overall_status: status, duration_s: 1, steps: { total: 1, passed: status === "passed" ? 1 : 0, failed: status === "passed" ? 0 : 1, skipped: 0, replay_decisions: 0, author_decisions: 1 }, upload: { performed: true, succeeded: true }, commit: { committed: false }, cancelled: false }));
  line(base("test_md_done", { overall_status: status, duration_s: 1, session_id: "sess-1" }));
}

switch (mode) {
  case "pass":
    line(base("stream_start", { cli_version: "0.10.9", surface: "testmd" }));
    line(base("test_md_step_start", { step_index: 1, heading: "Open the page" }));
    line(base("run_end", { status: "passed", credits_consumed: 2.5, reason_code: "success.complete" }));
    line(base("test_md_step_end", { step_index: 1, status: "passed", duration_s: 1 }));
    line(base("some_future_event", { anything: [1, 2, 3] }));
    terminal("passed");
    process.exit(0);
    break;
  case "fail":
    line(base("stream_start", { cli_version: "0.10.9" }));
    line(base("test_md_step_start", { step_index: 1, heading: "Check heading" }));
    line(base("step_event", { index: 1, event: "assertion", detail: "heading is shown", passed: false }));
    line(base("run_end", { status: "failed", reason: "Final verification failed", reason_code: "assertion_error.final_verification", result_code: 710, summary: "Heading missing", verdict: { root_cause: "Heading absent", suggestion: "Add the heading", confidence: 0.9, family: "product_bug" } }));
    line(base("test_md_step_end", { step_index: 1, status: "failed", duration_s: 1 }));
    terminal("failed");
    process.exit(1);
    break;
  case "pass-but-exit1":
    line(base("stream_start", {}));
    terminal("passed");
    process.exit(1);
    break;
  case "fail-but-exit0":
    line(base("stream_start", {}));
    terminal("failed");
    process.exit(0);
    break;
  case "noterminal":
    line(base("stream_start", {}));
    process.exit(0);
    break;
  case "exit2":
    process.stderr.write("error: file not found: <path>\n");
    process.exit(2);
    break;
  case "malformed":
    process.stdout.write("this is not json\n");
    process.stdout.write("\n");
    process.stdout.write('{"no_type":true}\n');
    process.stdout.write("[1,2,3]\n");
    process.stdout.write('{"type":"stream_start","cli_version":"0.10.9"');
    process.stdout.write("\n");
    terminal("passed");
    process.exit(0);
    break;
  case "split": {
    const full = JSON.stringify(base("stream_start", { cli_version: "0.10.9", note: "caf\u00e9 \u2713 \ud83d\ude00" })) + "\n";
    const buf = Buffer.from(full, "utf8");
    let i = 0;
    const step = 7; // splits inside multibyte characters
    const timer = setInterval(() => {
      process.stdout.write(buf.subarray(i, i + step));
      i += step;
      if (i >= buf.length) {
        clearInterval(timer);
        terminal("passed");
        process.exit(0);
      }
    }, 2);
    break;
  }
  case "big": {
    const chunk = "x".repeat(1023) + "\n";
    line(base("stream_start", {}));
    for (let i = 0; i < 3 * 1024; i++) {
      process.stdout.write(chunk);
      process.stderr.write(chunk);
    }
    terminal("passed");
    // Give the pipes time to drain before exiting.
    setTimeout(() => process.exit(0), 200);
    break;
  }
  case "secret":
    line(base("stream_start", { note: "token=SUPERSECRETVALUE12345 home=" + os.homedir() }));
    process.stderr.write("using key SUPERSECRETVALUE12345 at " + os.homedir() + "\n");
    terminal("passed");
    process.exit(0);
    break;
  case "env":
    line(base("stream_start", { note: "secret_visible=" + String(process.env.PROOFLOOP_TEST_SECRET !== undefined) + ",path_visible=" + String(process.env.PATH !== undefined || process.env.Path !== undefined) }));
    terminal("passed");
    process.exit(0);
    break;
  case "hang":
    line(base("stream_start", {}));
    setInterval(() => undefined, 1000);
    break;
  default:
    process.stderr.write("unknown mode\n");
    process.exit(64);
}
