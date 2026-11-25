import "server-only";
import { loadConfig } from "./config";
import { ProofLoopService } from "./services";
import { ensurePrivateDir, openDataDirDatabase } from "./storage/db";
import { VerificationService } from "./verification";

const KEY = Symbol.for("proofloop.service");
type Holder = { [KEY]?: ProofLoopService };

/**
 * One service (and one SQLite connection) per Node process (single-user local MVP).
 * Cached on globalThis so dev-mode module reloads do not open extra connections.
 *
 * On first use, runs left active by a previous process are marked UNKNOWN (never PASSED).
 */
export function getService(): ProofLoopService {
  const holder = globalThis as unknown as Holder;
  const existing = holder[KEY];
  if (existing) return existing;

  const config = loadConfig();
  const db = openDataDirDatabase(config.dataDir);
  ensurePrivateDir(config.testsDir);
  ensurePrivateDir(config.evidenceDir);
  ensurePrivateDir(config.kaneWorkDir);

  const service = new ProofLoopService(db, config.testsDir);
  service.verification = new VerificationService({
    db,
    projects: service.projects,
    criteria: service.criteria,
    runs: service.runs,
    evidence: service.evidence,
    dirs: { dataDir: config.dataDir, testsDir: config.testsDir, evidenceDir: config.evidenceDir, workDir: config.kaneWorkDir },
    kaneCliPath: config.kaneCliPath,
    timeoutMs: config.kaneTimeoutSeconds * 1000,
    maxBytesPerStream: config.maxOutputBytesPerStream,
  });
  const recovered = service.verification.recoverInterruptedRuns();
  if (recovered > 0) console.warn(`[proofloop] marked ${recovered} interrupted run(s) as UNKNOWN`);

  holder[KEY] = service;
  return service;
}

/** The verification service of the running process. */
export function getVerification(): VerificationService {
  const v = getService().verification;
  if (!v) throw new Error("Verification service is not initialized.");
  return v;
}
