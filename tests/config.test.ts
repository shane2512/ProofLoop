import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadConfig } from "@/server/config";
import { AppError, toErrorBody } from "@/server/errors";

// Label: ProofLoop application test (not Kane verification).
describe("loadConfig", () => {
  const cwd = path.resolve("/tmp/proofloop-test");

  it("defaults to loopback, port 3000, one run, 10 MiB cap", () => {
    const c = loadConfig({}, cwd);
    expect(c.host).toBe("127.0.0.1");
    expect(c.port).toBe(3000);
    expect(c.maxConcurrentKaneRuns).toBe(1);
    expect(c.maxOutputBytesPerStream).toBe(10 * 1024 * 1024);
    expect(c.kaneCliPath).toBeNull();
    expect(c.dataDir).toBe(path.resolve(cwd, "data"));
  });

  it("rejects non-loopback hosts", () => {
    expect(() => loadConfig({ PROOFLOOP_HOST: "0.0.0.0" }, cwd)).toThrow(/loopback/);
  });

  it("rejects invalid port and out-of-range timeout", () => {
    expect(() => loadConfig({ PROOFLOOP_PORT: "abc" }, cwd)).toThrow(/PORT/);
    expect(() => loadConfig({ KANE_TIMEOUT_SECONDS: "1" }, cwd)).toThrow(/TIMEOUT/);
    expect(() => loadConfig({ KANE_TIMEOUT_SECONDS: "99999" }, cwd)).toThrow(/TIMEOUT/);
  });

  it("treats empty strings as unset", () => {
    const c = loadConfig({ KANE_CLI_PATH: "", PROOFLOOP_PORT: "" }, cwd);
    expect(c.kaneCliPath).toBeNull();
    expect(c.port).toBe(3000);
  });
});

describe("toErrorBody", () => {
  it("keeps AppError code and status", () => {
    const { status, body } = toErrorBody(new AppError("NOT_FOUND", "Missing.", 404));
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("hides internal error messages", () => {
    const { status, body } = toErrorBody(new Error("secret-token at /home/user/x"));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("secret-token");
  });
});
