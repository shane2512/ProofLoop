import "server-only";
import { randomUUID } from "node:crypto";
import type { Project } from "../domain/types";
import type { ProjectCreateInput, ProjectPatchInput } from "../domain/validation";
import { AppError } from "../errors";
import { transaction, type Db } from "./db";

interface ProjectRow {
  id: string;
  name: string;
  target_url: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    targetUrl: r.target_url,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  };
}

const notFound = () => new AppError("NOT_FOUND", "Project not found.", 404);

export class ProjectRepository {
  constructor(private readonly db: Db) {}

  create(input: ProjectCreateInput): Project {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO projects (id, name, target_url, notes, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
      )
      .run(id, input.name, input.targetUrl, input.notes, now, now);
    return this.mustGet(id, true);
  }

  list(includeArchived: boolean): Project[] {
    const sql = includeArchived
      ? "SELECT * FROM projects ORDER BY updated_at DESC, rowid DESC"
      : "SELECT * FROM projects WHERE archived_at IS NULL ORDER BY updated_at DESC, rowid DESC";
    return (this.db.prepare(sql).all() as unknown as ProjectRow[]).map(toProject);
  }

  /** Archived projects are treated as absent unless `includeArchived` is set. */
  get(id: string, includeArchived = false): Project | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    if (!row) return null;
    if (row.archived_at !== null && !includeArchived) return null;
    return toProject(row);
  }

  mustGet(id: string, includeArchived = false): Project {
    const p = this.get(id, includeArchived);
    if (!p) throw notFound();
    return p;
  }

  update(id: string, patch: ProjectPatchInput): Project {
    return transaction(this.db, () => {
      const current = this.mustGet(id);
      const next = {
        name: patch.name ?? current.name,
        targetUrl: patch.targetUrl ?? current.targetUrl,
        notes: "notes" in patch ? (patch.notes ?? null) : current.notes,
      };
      this.db
        .prepare("UPDATE projects SET name = ?, target_url = ?, notes = ?, updated_at = ? WHERE id = ?")
        .run(next.name, next.targetUrl, next.notes, new Date().toISOString(), id);
      return this.mustGet(id);
    });
  }

  /** Soft archive only. Hard deletion is not exposed (INT-005). */
  archive(id: string): void {
    transaction(this.db, () => {
      this.mustGet(id);
      const now = new Date().toISOString();
      this.db.prepare("UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
    });
  }
}
