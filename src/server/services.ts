import "server-only";
import type { Criterion, Project } from "./domain/types";
import {
  parseCriterionCreate,
  parseCriterionPatch,
  parseProjectCreate,
  parseProjectPatch,
  requireId,
} from "./domain/validation";
import { hashManagedTestFile } from "./kane/testfile";
import { resolveManagedTestPath } from "./security/paths";
import { CriterionRepository } from "./storage/criteria";
import type { Db } from "./storage/db";
import { EvidenceRepository } from "./storage/evidence";
import { ProjectRepository } from "./storage/projects";
import { RunRepository } from "./storage/runs";
import { parseTestFileWrite, TestFileStore, type TestFileEntry } from "./test-files";
import type { VerificationService } from "./verification";

/** Application services for projects and criteria (INT-001 to INT-008). */
export class ProofLoopService {
  readonly projects: ProjectRepository;
  readonly criteria: CriterionRepository;
  readonly runs: RunRepository;
  readonly evidence: EvidenceRepository;
  readonly testFiles: TestFileStore;
  /** Set by the composition root (context.ts). Absent in tests that only exercise CRUD. */
  verification: VerificationService | null = null;

  constructor(
    readonly db: Db,
    private readonly testsDir: string,
  ) {
    this.projects = new ProjectRepository(db);
    this.criteria = new CriterionRepository(db, (rel) => hashManagedTestFile(testsDir, rel));
    this.runs = new RunRepository(db);
    this.evidence = new EvidenceRepository(db);
    this.testFiles = new TestFileStore(testsDir);
  }

  listProjects(includeArchived: boolean): Project[] {
    return this.projects.list(includeArchived);
  }

  createProject(body: unknown): Project {
    return this.projects.create(parseProjectCreate(body));
  }

  getProject(projectId: string): { project: Project; criteria: Criterion[] } {
    const id = requireId(projectId, "Project");
    const project = this.projects.mustGet(id);
    return { project, criteria: this.criteria.listActive(id) };
  }

  updateProject(projectId: string, body: unknown): Project {
    const id = requireId(projectId, "Project");
    return this.projects.update(id, parseProjectPatch(body));
  }

  archiveProject(projectId: string): void {
    this.projects.archive(requireId(projectId, "Project"));
  }

  createCriterion(projectId: string, body: unknown): Criterion {
    const pid = requireId(projectId, "Project");
    const input = parseCriterionCreate(body);
    resolveManagedTestPath(this.testsDir, input.testFile);
    this.projects.mustGet(pid);
    return this.criteria.create(pid, input);
  }

  updateCriterion(projectId: string, criterionId: string, body: unknown): Criterion {
    const pid = requireId(projectId, "Project");
    const cid = requireId(criterionId, "Criterion");
    const patch = parseCriterionPatch(body);
    if (patch.testFile !== undefined) resolveManagedTestPath(this.testsDir, patch.testFile);
    this.projects.mustGet(pid);
    return this.criteria.update(pid, cid, patch);
  }

  deleteCriterion(projectId: string, criterionId: string): void {
    const pid = requireId(projectId, "Project");
    const cid = requireId(criterionId, "Criterion");
    this.projects.mustGet(pid);
    this.criteria.softDelete(pid, cid);
  }

  listTestFiles(projectId: string): TestFileEntry[] {
    const id = requireId(projectId, "Project");
    this.projects.mustGet(id);
    return this.testFiles.list(id);
  }

  readTestFile(projectId: string, name: string) {
    const id = requireId(projectId, "Project");
    this.projects.mustGet(id);
    return this.testFiles.read(id, name);
  }

  writeTestFile(projectId: string, name: string, body: unknown): TestFileEntry {
    const id = requireId(projectId, "Project");
    this.projects.mustGet(id);
    return this.testFiles.write(id, name, parseTestFileWrite(body));
  }

  /** Storage health for INT-016. */
  storageReady(): boolean {
    try {
      this.db.prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }
}
