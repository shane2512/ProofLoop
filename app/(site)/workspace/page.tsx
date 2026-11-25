import type { Metadata } from "next";
import { ProjectList } from "@/components/workspace/ProjectList";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { loadConfig } from "@/server/config";

// Reads the server environment at request time, never at build time.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Projects, acceptance criteria and real Kane runs on this machine.",
};

export default function WorkspacePage() {
  const config = loadConfig();
  return (
    <WorkspaceShell>
      <header className="ws-page-head">
        <p className="ws-eyebrow">Local workspace</p>
        <h1 className="ws-h1">Workspace</h1>
        <p className="ws-note">
          Everything here runs on this machine at <code>{config.host}:{config.port}</code> and is not safe to expose to a network. A criterion is verified only by a real Kane run that passed.
        </p>
        <dl className="ws-readout">
          <div>
            <dt>Active runs</dt>
            <dd>{config.maxConcurrentKaneRuns} at a time</dd>
          </div>
          <div>
            <dt>Run time limit</dt>
            <dd>{config.kaneTimeoutSeconds} s</dd>
          </div>
          <div>
            <dt>Kane CLI</dt>
            <dd>{config.kaneCliPath ? "Set by KANE_CLI_PATH" : "Auto-detected"}</dd>
          </div>
        </dl>
      </header>
      <ProjectList />
    </WorkspaceShell>
  );
}
