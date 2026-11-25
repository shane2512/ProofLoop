import "server-only";
import { randomUUID } from "node:crypto";
import type { Criterion, RunStatus } from "../domain/types";
import { deriveCriterionStatus } from "../domain/status";
import { LIMITS, type CriterionCreateInput, type CriterionPatchInput } from "../domain/validation";
import { AppError } from "../errors";
import { isUniqueViolation, transaction, type Db } from "./db";

interface CriterionRow {
  id: string;
  project_id: string;
  title: string;
  expected_behavior: string;
  notes: string | null;
  test_file: string;
  step_label: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_run_id: string | null;
  last_run_status: RunStatus | null;
}

// The latest run decides the derived status. rowid breaks created_at ties.
const SELECT_CRITERION = `
SELECT c.*,
  (SELECT r.id FROM runs r WHERE r.criterion_id = c.id ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS last_run_id,
  (SELECT r.status FROM runs r WHERE r.criterion_id = c.id ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS last_run_status
FROM criteria c`;

function toCriterion(r: CriterionRow): Criterion {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    expectedBehavior: r.expected_behavior,
    notes: r.notes,
    testFile: r.test_file,
    stepLabel: r.step_label,
    position: r.position,
    status: deriveCriterionStatus(r.last_run_status),
    lastRunId: r.last_run_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

const notFound = () => new AppError("NOT_FOUND", "Criterion not found.", 404);
const pathConflict = () =>
  new AppError("CONFLICT", "Another active criterion in this project already uses that testFile.", 409, {
    field: "testFile",
  });

export class CriterionRepository {
  constructor(private readonly db: Db) {}

  listActive(projectId: string): Criterion[] {
    const rows = this.db
      .prepare(`${SELECT_CRITERION} WHERE c.project_id = ? AND c.deleted_at IS NULL ORDER BY c.position ASC`)
      .all(projectId) as unknown as CriterionRow[];
    return rows.map(toCriterion);
  }

  get(projectId: string, criterionId: string, includeDeleted = false): Criterion | null {
    const row = this.db
      .prepare(`${SELECT_CRITERION} WHERE c.project_id = ? AND c.id = ?`)
      .get(projectId, criterionId) as CriterionRow | undefined;
    if (!row) return null;
    if (row.deleted_at !== null && !includeDeleted) return null;
    return toCriterion(row);
  }

  mustGet(projectId: string, criterionId: string, includeDeleted = false): Criterion {
    const c = this.get(projectId, criterionId, includeDeleted);
    if (!c) throw notFound();
    return c;
  }

  /** The count limit is checked and the row inserted in one transaction (database.md). */
  create(projectId: string, input: CriterionCreateInput): Criterion {
    const id = randomUUID();
    try {
      transaction(this.db, () => {
        const active = (
          this.db
            .prepare("SELECT COUNT(*) AS n FROM criteria WHERE project_id = ? AND deleted_at IS NULL")
            .get(projectId) as { n: number }
        ).n;
        if (active >= LIMITS.maxActiveCriteria) {
          throw new AppError("CRITERION_LIMIT", `A project can have at most ${LIMITS.maxActiveCriteria} active criteria.`, 409);
        }
        const pos = (
          this.db.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM criteria WHERE project_id = ?").get(projectId) as {
            p: number;
          }
        ).p;
        const now = new Date().toISOString();
        this.db
          .prepare(
            `INSERT INTO criteria (id, project_id, title, expected_behavior, notes, test_file, step_label, position, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          )
          .run(id, projectId, input.title, input.expectedBehavior, input.notes, input.testFile, input.stepLabel, pos + 1, now, now);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw pathConflict();
      throw err;
    }
    return this.mustGet(projectId, id);
  }

  /** Updates only the criterion row. Existing run snapshots are never touched (FR-004). */
  update(projectId: string, criterionId: string, patch: CriterionPatchInput): Criterion {
    try {
      transaction(this.db, () => {
        const cur = this.mustGet(projectId, criterionId);
        const next = {
          title: patch.title ?? cur.title,
          expectedBehavior: patch.expectedBehavior ?? cur.expectedBehavior,
          notes: "notes" in patch ? (patch.notes ?? null) : cur.notes,
          testFile: patch.testFile ?? cur.testFile,
          stepLabel: "stepLabel" in patch ? (patch.stepLabel ?? null) : cur.stepLabel,
        };
        this.db
          .prepare(
            "UPDATE criteria SET title = ?, expected_behavior = ?, notes = ?, test_file = ?, step_label = ?, updated_at = ? WHERE id = ? AND project_id = ?",
          )
          .run(next.title, next.expectedBehavior, next.notes, next.testFile, next.stepLabel, new Date().toISOString(), criterionId, projectId);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw pathConflict();
      throw err;
    }
    return this.mustGet(projectId, criterionId);
  }

  /** Soft delete: the row and all of its runs stay readable. */
  softDelete(projectId: string, criterionId: string): void {
    transaction(this.db, () => {
      this.mustGet(projectId, criterionId);
      const now = new Date().toISOString();
      this.db
        .prepare("UPDATE criteria SET deleted_at = ?, updated_at = ? WHERE id = ? AND project_id = ?")
        .run(now, now, criterionId, projectId);
    });
  }
}
