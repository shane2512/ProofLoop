import "server-only";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Versioned migrations (TR-005). Never edit an applied migration; append a new one.
 * Schema follows database.md. Completed runs are append-only, enforced by triggers.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial",
    sql: `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  target_url TEXT NOT NULL,
  notes TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT NULL
);
CREATE INDEX idx_projects_archived_updated ON projects(archived_at, updated_at DESC);

CREATE TABLE criteria (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  expected_behavior TEXT NOT NULL CHECK(length(expected_behavior) BETWEEN 1 AND 2000),
  notes TEXT NULL,
  test_file TEXT NOT NULL,
  step_label TEXT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);
CREATE INDEX idx_criteria_project_pos ON criteria(project_id, deleted_at, position);
CREATE INDEX idx_criteria_project_updated ON criteria(project_id, updated_at DESC);
CREATE UNIQUE INDEX uq_criteria_active_test_file ON criteria(project_id, test_file) WHERE deleted_at IS NULL;

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  criterion_id TEXT NOT NULL REFERENCES criteria(id) ON DELETE RESTRICT,
  criterion_snapshot_json TEXT NOT NULL,
  test_file_snapshot TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','PASSED','FAILED','NOT_STARTED','TIMED_OUT','CANCELED','UNKNOWN')),
  exit_code INTEGER NULL,
  signal TEXT NULL,
  timed_out INTEGER NOT NULL DEFAULT 0,
  canceled INTEGER NOT NULL DEFAULT 0,
  summary TEXT NULL,
  raw_stdout_path TEXT NULL,
  raw_stderr_path TEXT NULL,
  stdout_truncated INTEGER NOT NULL DEFAULT 0,
  stderr_truncated INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NULL CHECK(duration_ms IS NULL OR duration_ms >= 0),
  started_at TEXT NULL,
  finished_at TEXT NULL,
  parser_version TEXT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_runs_project_created ON runs(project_id, created_at DESC);
CREATE INDEX idx_runs_criterion_created ON runs(criterion_id, created_at DESC);
CREATE INDEX idx_runs_status_created ON runs(status, created_at DESC);

CREATE TABLE run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_type TEXT NULL,
  raw_line TEXT NOT NULL,
  parsed_json TEXT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_run_events_seq ON run_events(run_id, sequence);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('EVIDENCE_PACK','SCREENSHOT','RECORDING','OTHER')),
  relative_path TEXT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL,
  available INTEGER NOT NULL CHECK(available IN (0,1)),
  unavailable_reason TEXT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_evidence_run ON evidence(run_id, created_at);

-- Snapshots and identity of a run never change.
CREATE TRIGGER trg_runs_immutable_identity
BEFORE UPDATE OF id, project_id, criterion_id, criterion_snapshot_json, test_file_snapshot, created_at ON runs
BEGIN
  SELECT RAISE(ABORT, 'runs identity and snapshot columns are immutable');
END;

-- A completed run (any status other than QUEUED/RUNNING) is never changed again.
CREATE TRIGGER trg_runs_completed_append_only
BEFORE UPDATE ON runs
WHEN OLD.status NOT IN ('QUEUED','RUNNING')
BEGIN
  SELECT RAISE(ABORT, 'completed runs are append-only');
END;

-- Run history cannot be deleted through SQL either.
CREATE TRIGGER trg_runs_no_delete
BEFORE DELETE ON runs
BEGIN
  SELECT RAISE(ABORT, 'runs cannot be deleted');
END;
`,
  },
];
