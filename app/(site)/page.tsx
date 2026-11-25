import type { Metadata } from "next";
import { Cta, IconLink } from "@/components/site/Cta";
import { Lines } from "@/components/site/Lines";
import { PageHero } from "@/components/site/PageHero";
import { DotWave } from "@/components/visual/DotWave";
import { HalftoneField } from "@/components/visual/HalftoneField";
import { InkBloom } from "@/components/visual/InkBloom";

export const metadata: Metadata = {
  title: { absolute: "ProofLoop: prove the fix with real Kane CLI runs" },
};

export default function LandingPage() {
  return (
    <>
      <PageHero
        eyebrow="Local-first verification for AI-written code"
        title="Prove It. Then Ship."
        note="Map acceptance criteria to real Kane CLI browser runs, keep the evidence, and re-verify every fix."
        cta={{ href: "/workspace", label: "Open Workspace" }}
      />

      <section className="bloom-scene" data-scene="bloom" aria-labelledby="meet-title">
        <div className="bloom-intro" data-bloom-intro>
          <p data-reveal>
            A local workspace that runs your human-written acceptance criteria through the real Kane CLI, in your own Chrome, and keeps every result.
          </p>
          <div data-reveal data-reveal-delay="0.12">
            <Cta href="/workflow" variant="light" magnetic>
              See the Workflow
            </Cta>
          </div>
        </div>

        <div className="bloom-art" data-bloom-art>
          <InkBloom />
        </div>

        <div className="statement">
          <Lines
            scene
            lines={[
              <span key="a" id="meet-title">
                Meet ProofLoop. Built
              </span>,
              <>
                to <span className="dim">connect criteria</span>
              </>,
              "to real browser",
              "evidence",
            ]}
          />
          <Lines
            scene
            lines={[
              "Run the test, read what",
              "really failed, and give",
              <>
                your agent <span className="dim">facts, not</span>
              </>,
              <span key="d" className="dim">
                guesses
              </span>,
            ]}
          />
        </div>
      </section>

      <section className="bento-wrap" aria-label="How ProofLoop verifies a criterion">
        <div className="bento" data-reveal-group>
          <div className="bento-col">
            <article className="card card-tall card-pad" data-reveal-item>
              <p className="card-code dot">01</p>
              <p className="card-text">One human-written criterion, mapped to one Kane test file you can read, review and commit.</p>
              <div style={{ flex: 1 }} />
              <div className="card-caption">
                <span>From &ldquo;it works on my machine&rdquo; to a recorded verdict</span>
                <IconLink href="/workflow" label="See the workflow" />
              </div>
            </article>
            <div className="card-row">
              <article className="card card-pad card-small" data-reveal-item>
                <p>A pass only counts while the test file and the criterion stay unchanged.</p>
                <p className="card-code dot">Fresh</p>
              </article>
              <article className="card card-pad card-small" data-reveal-item>
                <p>Checks behind every VERIFIED</p>
                <p className="card-code dot">V/04</p>
              </article>
            </div>
          </div>

          <div className="bento-col">
            <article className="card card-dark card-tall card-pad" data-reveal-item>
              <p className="card-text">
                ProofLoop starts <code>kane-cli testmd run</code> with one fixed command and no shell, then records stdout, stderr, the exit code, parsed events and
                the sealed evidence pack.
              </p>
              <p className="card-text">
                Exit 0 on its own verifies nothing. A pass also needs Kane&rsquo;s final event to agree, and a timeout or a cancel is never a pass.
              </p>
              <p className="card-code dot" style={{ marginTop: 28 }}>
                R/01
              </p>
              <div className="dotwave">
                <DotWave />
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <IconLink href="/evidence" label="See what gets recorded" accent />
              </div>
            </article>
          </div>

          <div className="bento-col">
            <article className="card card-media" data-reveal-item>
              <div className="media-frame">
                <HalftoneField />
              </div>
              <div className="card-caption">
                <span>From raw NDJSON to one readable verdict</span>
                <IconLink href="/evidence" label="See run outcomes" />
              </div>
            </article>
            <article className="card card-pad" data-reveal-item style={{ flex: 1, minHeight: 260, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span className="tag tag-next">Next: Phase 6</span>
              <div>
                <p className="card-code dot">H/01</p>
                <p className="card-text" style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>
                  Hand the facts to your agent
                </p>
                <p className="card-text">A report with expected and observed behavior, the exit code and evidence references. You copy it; nothing edits your code for you.</p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
