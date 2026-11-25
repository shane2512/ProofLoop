import type { Metadata } from "next";
import { Lines } from "@/components/site/Lines";
import { PageHero } from "@/components/site/PageHero";

export const metadata: Metadata = {
  title: "Workflow",
  description: "The six steps of the ProofLoop verification loop, and what is built today.",
};

type Tone = "light" | "dark" | "accent";
type Pattern = "dots" | "grid";

const STEPS: Array<{ code: string; title: string; text: string; detail: string; state: "built" | "next" | "partial"; tone: Tone; pattern: Pattern }> = [
  {
    code: "L/01",
    title: "Write the criterion",
    text: "A title and the behavior you expect, in plain words. Three to five per project, written by a person, never generated.",
    detail: "Title up to 120 characters, expected behavior up to 2,000.",
    state: "built",
    tone: "light",
    pattern: "dots",
  },
  {
    code: "L/02",
    title: "Map a Kane test",
    text: "Point the criterion at a _test.md file under the managed tests folder. One criterion, one file, so a pass means exactly one thing.",
    detail: "Paths are checked for traversal and symlink escapes.",
    state: "built",
    tone: "dark",
    pattern: "grid",
  },
  {
    code: "L/03",
    title: "Run it for real",
    text: "ProofLoop starts kane-cli testmd run in headless Chrome, streams its output, and waits for the process to close before deciding anything.",
    detail: "One active run at a time. Configurable timeout.",
    state: "built",
    tone: "light",
    pattern: "grid",
  },
  {
    code: "L/04",
    title: "Keep the evidence",
    text: "Raw stdout and stderr, parsed events and Kane's sealed .evidence pack are stored per run. History is append-only.",
    detail: "A completed run can never be edited or deleted.",
    state: "built",
    tone: "dark",
    pattern: "dots",
  },
  {
    code: "L/05",
    title: "Hand off the facts",
    text: "A report with the expected behavior, what Kane observed, the exit code and evidence references. You copy it to your coding agent yourself.",
    detail: "Report builder and copy flow arrive in Phase 6.",
    state: "next",
    tone: "accent",
    pattern: "dots",
  },
  {
    code: "L/06",
    title: "Re-verify the fix",
    text: "After you review the agent's change, a new run is a new record. The old failure stays, so the before and after sit side by side.",
    detail: "Engine built. Compare view arrives in Phase 7.",
    state: "partial",
    tone: "light",
    pattern: "grid",
  },
];

const PHASES: Array<{ code: string; name: string; text: string; state: "done" | "next" | "later" }> = [
  { code: "P/00", name: "Kane validation", text: "Real pass, fail, parse-error and cancel runs on kane-cli 0.10.9.", state: "done" },
  { code: "P/01", name: "App skeleton", text: "Next.js, strict TypeScript, loopback-only server.", state: "done" },
  { code: "P/02", name: "Data layer", text: "SQLite, migrations, immutable run snapshots, CRUD API.", state: "done" },
  { code: "P/03", name: "Kane adapter", text: "No-shell spawn, capped capture, parser, evidence discovery, redaction.", state: "done" },
  { code: "P/04", name: "Verification engine", text: "Run lifecycle, freshness-aware VERIFIED rule, run API.", state: "done" },
  { code: "P/05", name: "Dashboard", text: "Project, criterion and run screens inside the workspace.", state: "next" },
  { code: "P/06", name: "Agent handoff", text: "Factual report, redaction, copy and download.", state: "later" },
  { code: "P/07", name: "History and exports", text: "Run timeline, before and after compare, JSON and Markdown.", state: "later" },
];

const STATE_LABEL = { built: "Built", next: "Next", partial: "Partly built", done: "Done", later: "Planned" } as const;

export default function WorkflowPage() {
  return (
    <>
      <PageHero
        compact
        eyebrow="The loop"
        title="Six Steps. One Loop."
        note="Criteria in, evidence out. Every fix is checked by a new real run, and the old result is kept."
        cta={{ href: "/docs", label: "Set It Up" }}
      />

      <section className="section" aria-labelledby="steps-title">
        <div className="section-head">
          <Lines lines={[<span key="t" id="steps-title">From a claim</span>, <>to a <span className="dim">recorded verdict</span></>]} />
          <p data-reveal>Each step produces something you can inspect later. Nothing is inferred from an agent&rsquo;s summary or an exit code on its own.</p>
        </div>
        <div className="stack" data-stack>
          {STEPS.map((step) => (
            <article key={step.code} className={`stack-card stack-${step.tone === "accent" ? "dark stack-accent" : step.tone}`} data-stack-card>
              <div className="stack-copy">
                <div>
                  <span className={`tag ${step.state === "built" ? "tag-live" : "tag-next"}`}>{STATE_LABEL[step.state]}</span>
                  <h3 style={{ marginTop: 22 }}>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
                <p style={{ fontSize: 11, opacity: 0.75 }}>{step.detail}</p>
              </div>
              <div className="stack-visual" aria-hidden="true">
                <div className={step.pattern === "dots" ? "pattern-dots" : "pattern-grid"} />
                <span className="stack-glyph dot">{step.code}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-dark" id="status" aria-labelledby="status-title">
        <div className="section-head">
          <Lines lines={[<span key="t" id="status-title">What is built</span>, <span key="b" className="dim">and what is next</span>]} />
          <p data-reveal>This site describes the whole loop. The list below is the honest state of the code today.</p>
        </div>
        <div className="rows" data-reveal-group>
          {PHASES.map((p) => (
            <div key={p.code} className="row" data-reveal-item>
              <span className="row-code dot">{p.code}</span>
              <span className="row-name">{p.name}</span>
              <p>{p.text}</p>
              <span className="row-meta">
                <span className={`tag ${p.state === "done" ? "tag-live" : "tag-next"}`} style={{ background: "rgba(255,255,255,0.08)", color: "#cfcfd2" }}>
                  {STATE_LABEL[p.state]}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
