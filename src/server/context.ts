import "server-only";
import { loadConfig } from "./config";
import { ProofLoopService } from "./services";
import { ensurePrivateDir, openDataDirDatabase } from "./storage/db";

const KEY = Symbol.for("proofloop.service");
type Holder = { [KEY]?: ProofLoopService };

/**
 * One service (and one SQLite connection) per Node process (single-user local MVP).
 * Cached on globalThis so dev-mode module reloads do not open extra connections.
 */
export function getService(): ProofLoopService {
  const holder = globalThis as unknown as Holder;
  const existing = holder[KEY];
  if (existing) return existing;
  const config = loadConfig();
  const db = openDataDirDatabase(config.dataDir);
  ensurePrivateDir(config.testsDir);
  const service = new ProofLoopService(db, config.testsDir);
  holder[KEY] = service;
  return service;
}
