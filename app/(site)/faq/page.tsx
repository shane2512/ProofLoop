import type { Metadata } from "next";
import { Lines } from "@/components/site/Lines";
import { PageHero } from "@/components/site/PageHero";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Plain answers about how ProofLoop runs, what it records, and what it does not do.",
};

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Does ProofLoop run in the cloud?",
    a: "No. It is a local Next.js app that binds to 127.0.0.1 and stores everything on your machine. Kane runs in your own Chrome. Note that Kane itself uploads each run to your TestMu Test Manager account.",
  },
  {
    q: "Does it change my code automatically?",
    a: "No. ProofLoop never edits code or calls an agent for you. You copy the report to the coding agent you choose, review its change, and start a new run.",
  },
  {
    q: "Does exit code 0 mean my criterion is verified?",
    a: "Not on its own. A run is PASSED only when Kane exits 0 and its final test_md_done event also reports passed. The criterion is VERIFIED only while the test file, its mapping and the expected behavior are unchanged since that pass.",
  },
  {
    q: "Isn't this what the TestMu dashboard already does?",
    a: "The dashboard shows Kane runs and their evidence. ProofLoop adds your own acceptance criteria on top, keeps a status per criterion, records every re-run next to the earlier result, and builds a factual handoff for your agent.",
  },
  {
    q: "Do I need a TestMu account and credits?",
    a: "Yes. Runs use your Kane login and credits. In our validation, authoring a two-step test for the first time cost about 35 credits; cached replays reported none. Your costs may differ.",
  },
  {
    q: "Can it turn my plain-English criteria into tests?",
    a: "No. You write the _test.md file and map it to the criterion. Generated tests would make a pass mean something you never reviewed.",
  },
  {
    q: "Which Kane CLI version does it support?",
    a: "It was validated against kane-cli 0.10.9 on Windows. Other versions and other operating systems are untested, and the output format can change between releases.",
  },
  {
    q: "What happens if I close ProofLoop during a run?",
    a: "When it starts again, any run that was still queued or running is marked UNKNOWN. It is never marked as passed. The Kane process may have kept running, so check it if needed.",
  },
  {
    q: "Can I run two verifications at once?",
    a: "No. One run is active at a time. A second request gets a RUNNER_BUSY response until the first one finishes or is canceled.",
  },
];

export default function FaqPage() {
  return (
    <>
      <PageHero compact eyebrow="Questions" title="Plain Answers." note="What ProofLoop does, what it does not, and where its limits are." cta={{ href: "/docs", label: "Read the Docs" }} />
      <section className="section" aria-labelledby="faq-title">
        <div className="section-head">
          <Lines lines={[<span key="t" id="faq-title">Before you</span>, <span key="b" className="dim">run your first test</span>]} />
          <p data-reveal>Something missing? The setup guide covers installation, test file location and the local API.</p>
        </div>
        <div className="faq" data-reveal-group>
          {FAQS.map((item, i) => (
            <details key={item.q} data-reveal-item>
              <summary>
                <span className="q-num dot">{String(i + 1).padStart(2, "0")}</span>
                <span>{item.q}</span>
                <span className="q-icon" aria-hidden="true" />
              </summary>
              <div className="answer">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
