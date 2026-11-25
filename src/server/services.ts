import "server-only";
import type { Criterion, Project } from "./domain/types";
import {
  parseCriterionCreate,
  parseCriterionPatch,
  parseProjectCreate,
  parseProjectPatch,
  requireId,
} from "./domain/validation";
import { resolveManagedTestPath } from "./security/paths";
import { CriterionRepository } from "./storage/criteria";
import type { Db } from "./storage/db";
import { ProjectRepository } from "./storage/projects";
import { RunRepository } from "./storage/runs";

/** Application services for projects and criteria (INT-001 to INT-008). */
export class ProofLoopService {
  readonly projects: ProjectRepository;
  readonly criteria: CriterionRepository;
  readonly runs: RunRepository;

  constructor(
    readonly db: Db,
    private readonly testsDir: string,
  ) {
    this.projects = new ProjectRepository(db);
    this.criteria = new CriterionRepository(db);
    this.runs = new RunRepository(db);
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
