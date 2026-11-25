import type { Metadata } from "next";
import { IconLink } from "@/components/site/Cta";
import { Lines } from "@/components/site/Lines";
import { PageHero } from "@/components/site/PageHero";
import { DotWave } from "@/components/visual/DotWave";
import { HalftoneField } from "@/components/visual/HalftoneField";

export const metadata: Metadata = {
  title: "Evidence",
  description: "What ProofLoop records for every Kane run, and how a run outcome and a criterion status are decided.",
};

const OUTCOMES = [
  { code: "0", name: "PASSED", text: "Kane exited 0 and its final test_md_done event reported passed.", meta: "Both must agree" },
  { code: "1", name: "FAILED", text: "Kane exited 1 and its final event reported failed. Kane's own reason is kept and labeled as Kane's.", meta: "A step failed" },
  { code: "2", name: "NOT_STARTED", text: "Kane exited 2 before running, or could not be started at all. The stderr reason is kept.", meta: "Parse, file, auth, Chrome" },
  { code: "T", name: "TIMED_OUT", text: "The run passed ProofLoop's time limit and the process tree was stopped.", meta: "ProofLoop's own flag" },
  { code: "C", name: "CANCELED", text: "You stopped the run. It is recorded only after the process is seen to close.", meta: "ProofLoop's own flag" },
  { code: "?", name: "UNKNOWN", text: "Anything that disagrees or cannot be confirmed: exit 0 without a final event, a test edited mid-run, an app restart.", meta: "Never a pass" },
];

const CRITERION = [
  { code: "V", name: "VERIFIED", text: "The newest run passed, and the test file, its mapping and the expected behavior are unchanged since that run." },
  { code: "F", name: "FAILED", text: "The newest run failed. An earlier pass stays in history, untouched." },
  { code: "B", name: "BLOCKED", text: "The newest run never started, for example Kane was missing or the test file did not parse." },
  { code: "U", name: "UNVERIFIED", text: "No run yet, or the last pass went stale. The status note says why: test changed, test missing, mapping changed, or expectation edited." },
];

export default function EvidencePage() {
  return (
    <>
      <PageHero
        compact
        eyebrow="What gets recorded"
        title="Evidence Over Exit Codes."
        note="Every run keeps the raw output, the parsed events, Kane's evidence pack and a snapshot of the criterion it tested."
        cta={{ href: "/workflow", label: "See the Workflow" }}
      />

      <section className="section" aria-labelledby="captured-title">
        <div className="section-head">
          <Lines lines={[<span key="t" id="captured-title">One run,</span>, <>five <span className="dim">kinds of record</span></>]} />
          <p data-reveal>Stored locally under your data directory. Absolute paths, home folders and share tokens are redacted before anything is stored or shown.</p>
        </div>
        <div className="feature-grid" data-reveal-group>
          <article className="card card-dark card-pad row-2" data-reveal-item style={{ minHeight: 540 }}>
            <div>
              <p className="card-code dot">E/01</p>
              <p className="card-text" style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
                Sealed evidence pack
              </p>
              <p className="card-text">Kane&rsquo;s .evidence zip with per-step screenshots, logs and failure records. ProofLoop copies it only after checking the file exists and is a real zip. No guessed paths, no promised video.</p>
            </div>
            <div className="dotwave" style={{ height: "38%" }}>
              <DotWave seed={9} />
            </div>
          </article>
          <article className="card card-pad span-2" data-reveal-item>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <p className="card-code dot">E/02</p>
              <span className="tag">10 MiB per stream</span>
            </div>
            <div>
              <p className="card-text" style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>
                Raw stdout and stderr
              </p>
              <p className="card-text" style={{ maxWidth: "60ch" }}>
                Captured concurrently and saved to disk. If a stream passes the cap, the cut is marked in the file instead of being hidden.
              </p>
            </div>
          </article>
          <article className="card card-pad" data-reveal-item>
            <p className="card-code dot">E/03</p>
            <div>
              <p className="card-text" style={{ color: "var(--ink)", fontWeight: 600 }}>Parsed events</p>
              <p className="card-text">Every NDJSON line, typed when known. Unknown events are kept, not dropped.</p>
            </div>
          </article>
          <article className="card card-pad" data-reveal-item>
            <p className="card-code dot">E/04</p>
            <div>
              <p className="card-text" style={{ color: "var(--ink)", fontWeight: 600 }}>Immutable snapshot</p>
              <p className="card-text">The criterion text and a SHA-256 of the test file, frozen when the run is created.</p>
            </div>
          </article>
          <article className="card card-media span-all" data-reveal-item>
            <div className="media-frame" style={{ aspectRatio: "3.6" }}>
              <HalftoneField seed={8} cell={6} />
            </div>
            <div className="card-caption">
              <span>E/05: the exact command, redacted, and the exit code, signal and duration</span>
              <IconLink href="/docs#api" label="Read the run API" />
            </div>
          </article>
        </div>
      </section>

      <section className="section section-dark" id="outcomes" aria-labelledby="outcomes-title">
        <div className="section-head">
          <Lines lines={[<span key="t" id="outcomes-title">Six run outcomes.</span>, <span key="b" className="dim">Only one is a pass.</span>]} />
          <p data-reveal>Exit codes follow the documented kane-cli testmd run mapping. A forced kill also exits 1, so ProofLoop checks its own cancel and timeout flags first.</p>
        </div>
        <div className="rows" data-reveal-group>
          {OUTCOMES.map((o) => (
            <div key={o.name} className="row" data-reveal-item>
              <span className="row-code dot">{o.code}</span>
              <span className="row-name">{o.name}</span>
              <p>{o.text}</p>
              <span className="row-meta">{o.meta}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="criterion-title">
        <div className="section-head">
          <Lines lines={[<span key="t" id="criterion-title">A criterion&rsquo;s status</span>, <span key="b" className="dim">is derived, never set</span>]} />
          <p data-reveal>The newest run decides. A later cancel or failure replaces an earlier pass in the status, while the pass stays readable in history.</p>
        </div>
        <div className="rows" data-reveal-group>
          {CRITERION.map((c) => (
            <div key={c.name} className="row" data-reveal-item>
              <span className="row-code dot">{c.code}</span>
              <span className="row-name">{c.name}</span>
              <p>{c.text}</p>
              <span className="row-meta" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
