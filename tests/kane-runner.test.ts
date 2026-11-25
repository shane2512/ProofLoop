import { describe, expect, it } from "vitest";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { buildChildEnv, startKaneProcess, type RunOptions } from "@/server/kane/runner";
import { createRedactor } from "@/server/security/redact";
import type { ParsedLine } from "@/server/kane/parser";

// Label: ProofLoop application test using a FAKE child process (tests/helpers/fake-kane.mjs).
// It validates process supervision only. Its output is never a Kane verification.
const FAKE = fileURLToPath(new URL("./helpers/fake-kane.mjs", import.meta.url));

function opts(mode: string, over: Partial<RunOptions> = {}): RunOptions {
  return {
    command: { executable: process.execPath, args: [FAKE, mode] },
    cwd: os.tmpdir(),
    timeoutMs: 30_000,
    maxBytesPerStream: 10 * 1024 * 1024,
    redact: createRedactor(),
    ...over,
  };
}
const run = (mode: string, over: Partial<RunOptions> = {}) => startKaneProcess(opts(mode, over)).result;

describe("startKaneProcess with a fake child", () => {
  it("records a passing run only after close, with a terminal event", async () => {
    const r = await run("pass");
    expect(r.exitCode).toBe(0);
    expect(r.spawnError).toBeNull();
    expect(r.snapshot.done?.overallStatus).toBe("passed");
    expect(r.snapshot.evidenceId).toBe("2ea337ce-92f8-468e-af86-b8a22daa2002");
    expect(r.snapshot.unknownEventTypes).toEqual({ some_future_event: 1 });
    expect(r.outcome.status).toBe("PASSED");
    expect(r.startedAt <= r.finishedAt).toBe(true);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(r.stdoutTruncated).toBe(false);
  });

  it("classifies a failing run as FAILED with Kane's failure detail", async () => {
    const r = await run("fail");
    expect(r.exitCode).toBe(1);
    expect(r.outcome.status).toBe("FAILED");
    expect(r.snapshot.failure?.reasonCode).toBe("assertion_error.final_verification");
    expect(r.snapshot.assertions[0]).toMatchObject({ passed: false });
  });

  it("does not trust exit 0 without a terminal event", async () => {
    expect((await run("noterminal")).outcome.status).toBe("UNKNOWN");
  });

  it("does not trust a conflicting exit code and terminal status", async () => {
    expect((await run("pass-but-exit1")).outcome.status).toBe("UNKNOWN");
    expect((await run("fail-but-exit0")).outcome.status).toBe("UNKNOWN");
  });

  it("maps exit 2 to NOT_STARTED and keeps stderr", async () => {
    const r = await run("exit2");
    expect(r.outcome.status).toBe("NOT_STARTED");
    expect(r.stderr).toContain("file not found");
  });

  it("reports a missing executable as NOT_STARTED with a sanitized code", async () => {
    const r = await startKaneProcess(opts("pass", { command: { executable: "definitely-not-a-real-binary-xyz", args: [] } })).result;
    expect(r.spawnError).toBe("ENOENT");
    expect(r.outcome).toMatchObject({ status: "NOT_STARTED", errorCode: "SPAWN_FAILED" });
    expect(r.exitCode).toBeNull();
  });

  it("keeps malformed lines out of the verdict and continues parsing", async () => {
    const r = await run("malformed");
    expect(r.snapshot.malformedLineCount).toBeGreaterThanOrEqual(3);
    expect(r.snapshot.done?.overallStatus).toBe("passed");
    expect(r.stdout).toContain("this is not json");
  });

  it("reassembles lines split across chunks and inside multibyte characters", async () => {
    const events: ParsedLine[] = [];
    const r = await run("split", { onEvent: (l) => events.push(l) });
    expect(r.snapshot.malformedLineCount).toBe(0);
    expect(r.snapshot.streamStarted).toBe(true);
    const first = events[0];
    expect(first?.kind === "event" && first.data.note).toBe("caf\u00e9 \u2713 \ud83d\ude00");
    expect(r.outcome.status).toBe("PASSED");
  });

  it("drains stdout and stderr concurrently and enforces the byte cap with a marker", async () => {
    const r = await run("big", { maxBytesPerStream: 100_000 });
    expect(r.stdoutTruncated).toBe(true);
    expect(r.stderrTruncated).toBe(true);
    expect(r.stdout.length).toBeLessThan(100_000 + 200);
    expect(r.stdout).toContain("[ProofLoop: output truncated at 100000 bytes]");
    expect(r.stdoutBytes).toBeGreaterThan(3 * 1024 * 1024);
    expect(r.stderrBytes).toBeGreaterThanOrEqual(3 * 1024 * 1024);
    // Parsing continues past the capture cap, so the terminal event is still seen.
    expect(r.snapshot.done?.overallStatus).toBe("passed");
  }, 30_000);

  it("redacts secrets, home paths and nothing else sensitive reaches the result", async () => {
    const r = await run("secret", { redact: createRedactor({ secrets: ["SUPERSECRETVALUE12345"] }) });
    const all = r.stdout + r.stderr + JSON.stringify(r.snapshot) + r.redactedCommand.join(" ");
    expect(all).not.toContain("SUPERSECRETVALUE12345");
    expect(all).not.toContain(os.homedir());
    expect(r.stdout).toContain("[REDACTED]");
    expect(r.stdout).toContain("<HOME>");
  });

  it("does not pass server environment variables to the child", async () => {
    process.env.PROOFLOOP_TEST_SECRET = "should-not-leak";
    try {
      const events: ParsedLine[] = [];
      await run("env", { onEvent: (l) => events.push(l) });
      const first = events[0];
      const note = first?.kind === "event" ? String(first.data.note) : "";
      expect(note).toContain("secret_visible=false");
      expect(note).toContain("path_visible=true");
    } finally {
      delete process.env.PROOFLOOP_TEST_SECRET;
    }
  });

  it("times out a hung process, kills it, and never reports PASSED", async () => {
    const r = await run("hang", { timeoutMs: 1500 });
    expect(r.timedOut).toBe(true);
    expect(r.terminationUnconfirmed).toBe(false);
    expect(r.outcome.status).toBe("TIMED_OUT");
    expect(r.durationMs).toBeGreaterThanOrEqual(1400);
    expect(r.durationMs).toBeLessThan(15_000);
  }, 30_000);

  it("cancels a running process and reports CANCELED only after close", async () => {
    const handle = startKaneProcess(opts("hang"));
    setTimeout(() => handle.cancel(), 700);
    const r = await handle.result;
    expect(r.canceled).toBe(true);
    expect(r.outcome.status).toBe("CANCELED");
    expect(r.terminationUnconfirmed).toBe(false);
  }, 30_000);

  it("ignores cancel after the process already finished", async () => {
    const handle = startKaneProcess(opts("pass"));
    const r = await handle.result;
    handle.cancel();
    expect(r.canceled).toBe(false);
    expect(r.outcome.status).toBe("PASSED");
  });

  it("survives an onEvent consumer that throws", async () => {
    const r = await run("pass", {
      onEvent: () => {
        throw new Error("consumer bug");
      },
    });
    expect(r.outcome.status).toBe("PASSED");
  });

  it("numbers events in order", async () => {
    const seq: number[] = [];
    await run("pass", { onEvent: (_l, n) => seq.push(n) });
    expect(seq.length).toBeGreaterThan(3);
    expect(seq).toEqual(seq.map((_, i) => i + 1));
  });
});

describe("buildChildEnv", () => {
  it("keeps allowlisted names case-insensitively and drops everything else", () => {
    const env = buildChildEnv({ Path: "p", APPDATA: "a", DATABASE_URL: "secret", NEXT_PUBLIC_X: "1", AWS_SECRET_ACCESS_KEY: "k" });
    expect(env).toEqual({ Path: "p", APPDATA: "a" });
  });
});
