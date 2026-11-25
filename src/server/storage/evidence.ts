import "server-only";
import { randomUUID } from "node:crypto";
import type { EvidenceRef } from "../domain/types";
import type { Db } from "./db";

interface EvidenceRow {
  id: string;
  run_id: string;
  kind: EvidenceRef["kind"];
  relative_path: string | null;
  label: string;
  source: string;
  available: number;
  unavailable_reason: string | null;
  created_at: string;
}

const toRef = (r: EvidenceRow): EvidenceRef => ({
  id: r.id,
  runId: r.run_id,
  kind: r.kind,
  relativePath: r.relative_path,
  label: r.label,
  source: r.source,
  available: r.available === 1,
  unavailableReason: r.unavailable_reason,
  createdAt: r.created_at,
});

export interface NewEvidence {
  runId: string;
  kind: EvidenceRef["kind"];
  /** Path relative to the evidence root. Only set after the file was verified (FR-013). */
  relativePath: string | null;
  label: string;
  source: string;
  available: boolean;
  unavailableReason: string | null;
}

export class EvidenceRepository {
  constructor(private readonly db: Db) {}

  add(e: NewEvidence): EvidenceRef {
    if (e.available && e.relativePath === null) throw new Error("Available evidence needs a verified path.");
    if (!e.available && e.unavailableReason === null) throw new Error("Unavailable evidence needs a reason.");
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO evidence (id, run_id, kind, relative_path, label, source, available, unavailable_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, e.runId, e.kind, e.available ? e.relativePath : null, e.label, e.source, e.available ? 1 : 0, e.unavailableReason, new Date().toISOString());
    const row = this.db.prepare("SELECT * FROM evidence WHERE id = ?").get(id) as unknown as EvidenceRow;
    return toRef(row);
  }

  listForRun(runId: string): EvidenceRef[] {
    const rows = this.db.prepare("SELECT * FROM evidence WHERE run_id = ? ORDER BY created_at ASC, rowid ASC").all(runId) as unknown as EvidenceRow[];
    return rows.map(toRef);
  }

  hasAvailable(runId: string): boolean {
    const r = this.db.prepare("SELECT 1 AS x FROM evidence WHERE run_id = ? AND available = 1 LIMIT 1").get(runId) as { x: number } | undefined;
    return r !== undefined;
  }
}
