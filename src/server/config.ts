import "server-only";
import path from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  testsDir: string;
  evidenceDir: string;
  /** Working directory for Kane processes. Kane writes .testmuai/evidence beneath it. */
  kaneWorkDir: string;
  kaneCliPath: string | null;
  kaneTimeoutSeconds: number;
  maxConcurrentKaneRuns: 1;
  maxOutputBytesPerStream: number;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
export const MIN_TIMEOUT_SECONDS = 10;
export const MAX_TIMEOUT_SECONDS = 1800;
const DEFAULT_TIMEOUT_SECONDS = 300;
const DEFAULT_PORT = 3000;
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MiB per stream (TR-007)

type Env = Record<string, string | undefined>;

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Builds configuration from a server environment. Throws on unsafe or
 * invalid values; messages never include the offending secret-bearing values
 * beyond the variable name.
 */
export function loadConfig(env: Env = process.env, cwd: string = process.cwd()): AppConfig {
  const host = emptyToUndefined(env.PROOFLOOP_HOST) ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("PROOFLOOP_HOST must be a loopback address (SEC-001).");
  }

  const portRaw = emptyToUndefined(env.PROOFLOOP_PORT);
  const port = portRaw === undefined ? DEFAULT_PORT : Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PROOFLOOP_PORT must be an integer between 1 and 65535.");
  }

  const timeoutRaw = emptyToUndefined(env.KANE_TIMEOUT_SECONDS);
  const kaneTimeoutSeconds = timeoutRaw === undefined ? DEFAULT_TIMEOUT_SECONDS : Number(timeoutRaw);
  if (
    !Number.isInteger(kaneTimeoutSeconds) ||
    kaneTimeoutSeconds < MIN_TIMEOUT_SECONDS ||
    kaneTimeoutSeconds > MAX_TIMEOUT_SECONDS
  ) {
    throw new Error(
      `KANE_TIMEOUT_SECONDS must be an integer between ${MIN_TIMEOUT_SECONDS} and ${MAX_TIMEOUT_SECONDS}.`,
    );
  }

  const dataDir = path.resolve(cwd, emptyToUndefined(env.PROOFLOOP_DATA_DIR) ?? "data");
  const testsDir = path.resolve(cwd, emptyToUndefined(env.PROOFLOOP_TESTS_DIR) ?? path.join(dataDir, "tests"));
  const evidenceDir = path.resolve(
    cwd,
    emptyToUndefined(env.PROOFLOOP_EVIDENCE_DIR) ?? path.join(dataDir, "evidence"),
  );

  return {
    host,
    port,
    dataDir,
    testsDir,
    evidenceDir,
    kaneWorkDir: path.join(dataDir, "kane-work"),
    kaneCliPath: emptyToUndefined(env.KANE_CLI_PATH) ?? null,
    kaneTimeoutSeconds,
    maxConcurrentKaneRuns: 1,
    maxOutputBytesPerStream: DEFAULT_MAX_OUTPUT_BYTES,
  };
}
