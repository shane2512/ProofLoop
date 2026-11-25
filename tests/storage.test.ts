import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DB_FILENAME, openDatabase, runMigrations, type Db } from "@/server/storage/db";
import { ProofLoopService } from "@/server/services";
import { AppError } from "@/server/errors";
import { MIGRATIONS } from "@/server/storage/migrations";

// Label: ProofLoop application test (not Kane verification). Runs created here are
// storage fixtures and never represent a Kane result.
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : `OTHER:${(e as Error).message}`;
  }
  return "NO_ERROR";
}

describe("storage", () => {
  let tmp: string;
  let db: Db;
  let svc: ProofLoopService;
  const crit = (n: number) => ({
    title: `Criterion ${n}`,
    expectedBehavior: "Expected",
    testFile: `proj/c${n}_test.md`,
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proofloop-db-"));
    db = openDatabase(path.join(tmp, DB_FILENAME));
    svc = new ProofLoopService(db, path.join(tmp, "tests"));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("migrations are idempotent and foreign keys are on", () => {
    expect(runMigrations(db)).toBe(MIGRATIONS.length);
    expect(runMigrations(db)).toBe(MIGRATIONS.length);
    const rows = db.prepare("SELECT COUNT(*) AS n FROM schema_version").get() as { n: number };
    expect(rows.n).toBe(MIGRATIONS.length);
    expect((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys).toBe(1);
  });

  it("persists projects and criteria across a reopen", () => {
    const p = svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    svc.createCriterion(p.id, crit(1));
    db.close();
    db = openDatabase(path.join(tmp, DB_FILENAME));
    svc = new ProofLoopService(db, path.join(tmp, "tests"));
    const got = svc.getProject(p.id);
    expect(got.project.name).toBe("Demo");
    expect(got.criteria).toHaveLength(1);
    expect(got.criteria[0]?.status).toBe("UNVERIFIED");
  });

  it("archives projects softly and hides them by default", () => {
    const p = svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    svc.archiveProject(p.id);
    expect(svc.listProjects(false)).toHaveLength(0);
    expect(svc.listProjects(true)).toHaveLength(1);
    expect(codeOf(() => svc.getProject(p.id))).toBe("NOT_FOUND");
  });

  it("allows at most five active criteria and frees a slot after soft delete", () => {
    const p = svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    const made = [1, 2, 3, 4, 5].map((n) => svc.createCriterion(p.id, crit(n)));
    expect(codeOf(() => svc.createCriterion(p.id, crit(6)))).toBe("CRITERION_LIMIT");
    svc.deleteCriterion(p.id, made[0]!.id);
    expect(svc.createCriterion(p.id, crit(6)).title).toBe("Criterion 6");
    expect(svc.getProject(p.id).criteria).toHaveLength(5);
  });

  it("rejects a second active criterion mapped to the same test file", () => {
    const p = svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    svc.createCriterion(p.id, crit(1));
    expect(codeOf(() => svc.createCriterion(p.id, crit(1)))).toBe("CONFLICT");
  });

  it("rejects traversal in testFile at the service layer", () => {
    const p = svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    expect(codeOf(() => svc.createCriterion(p.id, { ...crit(1), testFile: "../x_test.md" }))).toBe("VALIDATION_ERROR");
  });

  it("keeps run snapshots unchanged when a criterion is edited or deleted", () => {
    const p = svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    const c = svc.createCriterion(p.id, crit(1));
    const run = svc.runs.createQueued(p.id, c.id, {
      projectName: p.name,
      targetUrl: p.targetUrl,
      title: c.title,
      expectedBehavior: c.expectedBehavior,
      notes: c.notes,
      testFile: c.testFile,
      stepLabel: c.stepLabel,
    });
    svc.updateCriterion(p.id, c.id, { title: "Renamed", expectedBehavior: "Changed" });
    svc.deleteCriterion(p.id, c.id);
    const after = svc.runs.mustGet(run.id);
    expect(after.criterionSnapshot.title).toBe("Criterion 1");
    expect(after.criterionSnapshot.expectedBehavior).toBe("Expected");
  });

  it("derives criterion status from the newest run and never from a manual value", () => {
    const p = svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    const c = svc.createCriterion(p.id, crit(1));
    const snap = { projectName: p.name, targetUrl: p.targetUrl, title: c.title, expectedBehavior: "E", notes: null, testFile: c.testFile, stepLabel: null };
    const r1 = svc.runs.createQueued(p.id, c.id, snap);
    expect(svc.getProject(p.id).criteria[0]?.status).toBe("RUNNING");
    svc.runs.updateLifecycle(r1.id, { status: "FAILED", exitCode: 1 });
    expect(svc.getProject(p.id).criteria[0]?.status).toBe("FAILED");
    const r2 = svc.runs.createQueued(p.id, c.id, snap);
    svc.runs.updateLifecycle(r2.id, { status: "NOT_STARTED", exitCode: 2 });
    expect(svc.getProject(p.id).criteria[0]?.status).toBe("BLOCKED");
    expect(svc.getProject(p.id).criteria[0]?.lastRunId).toBe(r2.id);
    expect(svc.runs.listForCriterion(c.id).map((r) => r.id)).toEqual([r2.id, r1.id]);
  });

  it("makes completed runs append-only and run history undeletable", () => {
    const p = svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    const c = svc.createCriterion(p.id, crit(1));
    const snap = { projectName: p.name, targetUrl: p.targetUrl, title: c.title, expectedBehavior: "E", notes: null, testFile: c.testFile, stepLabel: null };
    const r = svc.runs.createQueued(p.id, c.id, snap);
    svc.runs.updateLifecycle(r.id, { status: "PASSED", exitCode: 0 });
    expect(codeOf(() => svc.runs.updateLifecycle(r.id, { status: "FAILED" }))).toBe("CONFLICT");
    expect(svc.runs.mustGet(r.id).status).toBe("PASSED");
    expect(() => db.prepare("DELETE FROM runs WHERE id = ?").run(r.id)).toThrow(/cannot be deleted/);
    expect(() => db.prepare("UPDATE runs SET criterion_snapshot_json = '{}' WHERE id = ?").run(r.id)).toThrow();
  });

  it("blocks snapshot edits even on an active run", () => {
    const p = svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    const c = svc.createCriterion(p.id, crit(1));
    const snap = { projectName: p.name, targetUrl: p.targetUrl, title: c.title, expectedBehavior: "E", notes: null, testFile: c.testFile, stepLabel: null };
    const r = svc.runs.createQueued(p.id, c.id, snap);
    expect(() => db.prepare("UPDATE runs SET criterion_snapshot_json = '{}' WHERE id = ?").run(r.id)).toThrow(/immutable/);
  });

  it("enforces foreign keys on runs", () => {
    expect(() =>
      db
        .prepare("INSERT INTO runs (id, project_id, criterion_id, criterion_snapshot_json, test_file_snapshot, status, created_at) VALUES ('r','nope','nope','{}','x','QUEUED','t')")
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it("appends events with increasing sequence numbers", () => {
    const p = svc.createProject({ name: "Demo", targetUrl: "https://a.test" });
    const c = svc.createCriterion(p.id, crit(1));
    const snap = { projectName: p.name, targetUrl: p.targetUrl, title: c.title, expectedBehavior: "E", notes: null, testFile: c.testFile, stepLabel: null };
    const r = svc.runs.createQueued(p.id, c.id, snap);
    expect(svc.runs.appendEvent(r.id, null, "raw one", null).sequence).toBe(1);
    expect(svc.runs.appendEvent(r.id, "x", "raw two", null).sequence).toBe(2);
  });
});
