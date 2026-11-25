import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppError } from "../errors";
import { MIGRATIONS, type Migration } from "./migrations";

export type Db = DatabaseSync;

export const DB_FILENAME = "proofloop.sqlite";

/** Creates a private (owner-only where the OS supports it) directory. */
export function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // mkdir's mode is ignored for existing directories; best effort on POSIX.
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // Not fatal; verified by checkDataDir on POSIX.
    }
  }
}

/** Verifies a directory is writable. On POSIX also rejects group/other access (TR-006, SEC-007). */
export function checkDataDir(dir: string): void {
  const probe = path.join(dir, `.write-probe-${process.pid}`);
  try {
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
  } catch {
    throw new AppError("STORAGE_ERROR", "Data directory is not writable.", 500);
  }
  if (process.platform !== "win32") {
    const mode = fs.statSync(dir).mode & 0o077;
    if (mode !== 0) throw new AppError("STORAGE_ERROR", "Data directory permissions are too open.", 500);
  }
}

const txDepth = new WeakMap<Db, number>();

/**
 * Runs `fn` in a write transaction; rolls back on any throw. Calls made inside another
 * `transaction` become savepoints, so callers can compose repository methods atomically.
 */
export function transaction<T>(db: Db, fn: () => T): T {
  const depth = txDepth.get(db) ?? 0;
  if (depth === 0) {
    db.exec("BEGIN IMMEDIATE");
    txDepth.set(db, 1);
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Connection already rolled back; keep the original error.
      }
      throw err;
    } finally {
      txDepth.set(db, 0);
    }
  }
  const savepoint = `sp_${depth}`;
  db.exec(`SAVEPOINT ${savepoint}`);
  txDepth.set(db, depth + 1);
  try {
    const result = fn();
    db.exec(`RELEASE ${savepoint}`);
    return result;
  } catch (err) {
    try {
      db.exec(`ROLLBACK TO ${savepoint}`);
      db.exec(`RELEASE ${savepoint}`);
    } catch {
      // Outer transaction already rolled back; keep the original error.
    }
    throw err;
  } finally {
    txDepth.set(db, depth);
  }
}

/** Idempotent: applies only migrations newer than the recorded version, each in one transaction. */
export function runMigrations(db: Db, migrations: readonly Migration[] = MIGRATIONS): number {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const row = db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_version").get() as { v: number };
  let current = row.v;
  for (const m of migrations) {
    if (m.version <= current) continue;
    transaction(db, () => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)").run(
        m.version,
        m.name,
        new Date().toISOString(),
      );
    });
    current = m.version;
  }
  return current;
}

/** Opens a database file (or ":memory:") with foreign keys on and migrations applied. */
export function openDatabase(file: string): Db {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  runMigrations(db);
  return db;
}

export function openDataDirDatabase(dataDir: string): Db {
  try {
    ensurePrivateDir(dataDir);
    checkDataDir(dataDir);
    return openDatabase(path.join(dataDir, DB_FILENAME));
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("STORAGE_ERROR", "Storage could not be opened.", 500);
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}
