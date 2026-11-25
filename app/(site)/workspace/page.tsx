import type { Metadata } from "next";
import { Cta } from "@/components/site/Cta";
import { Lines } from "@/components/site/Lines";
import { PageHero } from "@/components/site/PageHero";
import { loadConfig } from "@/server/config";

// Reads the server environment at request time, never at build time.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Local ProofLoop workspace status.",
};

export default function WorkspacePage() {
  const config = loadConfig();
  return (
    <>
      <PageHero compact eyebrow="Local workspace" title="Running on Loopback." note="This app runs on this machine only and is not safe to expose to a network." />
      <section className="section" aria-labelledby="ws-title">
        <div className="section-head">
          <Lines lines={[<span key="t" id="ws-title">The dashboard</span>, <span key="b" className="dim">arrives in Phase 5</span>]} />
          <p data-reveal>Until then, the verification engine is available through the local API. Projects, criteria and runs you create there will show up in the dashboard.</p>
        </div>
        <div className="readout" data-reveal-group>
          <article className="card card-dark card-pad" data-reveal-item>
            <span className="tag tag-live">Server running</span>
            <p className="card-code dot" style={{ margin: "26px 0 18px" }}>
              {config.host}:{config.port}
            </p>
            <div className="kv">
              <span>Max active runs</span>
              <span>{config.maxConcurrentKaneRuns}</span>
            </div>
            <div className="kv">
              <span>Run timeout</span>
              <span>{config.kaneTimeoutSeconds} s</span>
            </div>
            <div className="kv">
              <span>Output cap per stream</span>
              <span>{Math.round(config.maxOutputBytesPerStream / 1024 / 1024)} MiB</span>
            </div>
            <div className="kv">
              <span>Kane CLI path</span>
              <span>{config.kaneCliPath ? "Set by KANE_CLI_PATH" : "Auto-detected"}</span>
            </div>
          </article>
          <article className="card card-pad" data-reveal-item style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 24 }}>
            <div>
              <span className="tag tag-next">Next: Phase 5</span>
              <p className="card-text" style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600, marginTop: 22 }}>
                Project, criterion and run screens
              </p>
              <p className="card-text" style={{ maxWidth: "52ch" }}>
                Create a project, map criteria to tests, start a run, watch its status and read the raw output and evidence. Health is at <code>/api/v1/health</code>.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Cta href="/docs#api" variant="dark">
                Use the Local API
              </Cta>
              <Cta href="/workflow#status" variant="light">
                See Build Status
              </Cta>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
