import "server-only";
import { buildKaneVersionCommand, resolveKaneLaunch, SUPPORTED_KANE_VERSION } from "./command";
import { startKaneProcess } from "./runner";
import type { Redactor } from "../security/redact";

export interface PreflightResult {
  found: boolean;
  version: string | null;
  versionSupported: boolean;
  /** Plain statement of what was and was not checked. */
  detail: string;
}

/**
 * Checks that the Kane executable can be found and reports its version (FR-006).
 * It does not check authentication, Chrome or credits: no machine-readable output for
 * `whoami` or `balance` was validated, and a failed check here is not proof either way.
 */
export async function preflightKane(configuredPath: string | null, cwd: string, redact: Redactor): Promise<PreflightResult> {
  const launch = resolveKaneLaunch(configuredPath);
  if (launch === null) {
    return { found: false, version: null, versionSupported: false, detail: "Kane CLI was not found." };
  }
  const handle = startKaneProcess({
    command: buildKaneVersionCommand(launch),
    cwd,
    timeoutMs: 30_000,
    maxBytesPerStream: 64 * 1024,
    redact,
  });
  const r = await handle.result;
  if (r.spawnError !== null) {
    return { found: false, version: null, versionSupported: false, detail: `Kane could not be started (${r.spawnError}).` };
  }
  const match = /(\d+\.\d+\.\d+)/.exec(r.stdout);
  const version = match?.[1] ?? null;
  if (r.exitCode !== 0 || version === null) {
    return { found: true, version, versionSupported: false, detail: "Kane did not report a version." };
  }
  const supported = version === SUPPORTED_KANE_VERSION;
  return {
    found: true,
    version,
    versionSupported: supported,
    detail: supported
      ? "Kane version matches the validated version. Authentication, Chrome and credits are not checked."
      : `Kane version ${version} differs from the validated ${SUPPORTED_KANE_VERSION}. Behavior is unverified.`,
  };
}
