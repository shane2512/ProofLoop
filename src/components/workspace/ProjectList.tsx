"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/status";
import { ErrorNotice } from "./ErrorNotice";
import { ProjectForm } from "./ProjectForm";
import { useLoad } from "./useLoad";

export function ProjectList() {
  const router = useRouter();
  const { data: projects, error, loading, reload } = useLoad((signal) => api.listProjects(signal), "projects");

  return (
    <div className="ws-split">
      <section aria-labelledby="ws-projects-title" className="ws-panel">
        <h2 id="ws-projects-title" className="ws-h2">
          Projects
        </h2>
        {error && !projects ? <ErrorNotice error={error} onRetry={reload} /> : null}
        {loading && !projects && !error ? (
          <ul className="ws-list" aria-busy="true" aria-label="Loading projects">
            {[0, 1].map((i) => (
              <li key={i} className="ws-skeleton" aria-hidden="true" />
            ))}
          </ul>
        ) : null}
        {projects && projects.length === 0 ? (
          <div className="ws-empty">
            <p className="ws-empty-title">No projects yet.</p>
            <p>A project is one website you want to check. Create one, then add the criteria that must hold on it.</p>
          </div>
        ) : null}
        {projects && projects.length > 0 ? (
          <ul className="ws-list">
            {projects.map((p) => (
              <li key={p.id}>
                <Link className="ws-project-link" href={`/workspace/projects/${p.id}`}>
                  <span className="ws-project-name">{p.name}</span>
                  <span className="ws-project-url">{p.targetUrl}</span>
                  <span className="ws-project-meta">Created {formatTime(p.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {error && projects ? <ErrorNotice error={error} onRetry={reload} /> : null}
      </section>

      <section aria-labelledby="ws-new-title" className="ws-panel">
        <h2 id="ws-new-title" className="ws-h2">
          New project
        </h2>
        <ProjectForm onSaved={(p) => router.push(`/workspace/projects/${p.id}`)} />
      </section>
    </div>
  );
}
