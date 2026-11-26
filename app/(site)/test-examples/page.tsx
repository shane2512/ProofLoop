import type { Metadata } from "next";
import Link from "next/link";
import { CopyCode } from "@/components/site/CopyCode";
import { PageHero } from "@/components/site/PageHero";
import { EXAMPLES, MINIMAL, RULES, STATUS_LABEL } from "@/lib/test-examples";

export const metadata: Metadata = {
  title: "How to write a test",
  description: "A Kane test is a short text file: a settings block and plain-language steps. How to write one, with examples you can copy.",
};

const SECTIONS = [
  { id: "shape", label: "What a test looks like" },
  { id: "rules", label: "Rules that matter" },
  { id: "examples", label: "Examples to copy" },
  { id: "use", label: "Use one in ProofLoop" },
  { id: "mistakes", label: "Common mistakes" },
];

const toLines = (content: string) => content.replace(/\n$/, "").split("\n");

export default function TestExamplesPage() {
  return (
    <>
      <PageHero
        compact
        eyebrow="Writing tests"
        title="How To Write A Test."
        note="A test is a short text file. You describe what to do and what to check, in plain sentences."
        cta={{ href: "/docs#tests", label: "Where Test Files Go" }}
      />
      <section className="section">
        <div className="docs">
          <nav className="docs-toc" aria-label="On this page">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`}>
                {s.label}
              </a>
            ))}
          </nav>
          <div className="docs-body">
            <section id="shape" data-reveal>
              <h2>
                <span className="dot">01</span>What a test looks like
              </h2>
              <p>
                You do not write code. A test has three parts: a small settings block, a title, and steps written as sentences. Kane reads the sentences, drives Chrome, and reports what it saw.
              </p>
              <CopyCode prompt={false} lines={toLines(MINIMAL.content)} />
              <ul>
                <li>
                  <strong>Settings block</strong> (between the two <code>---</code> lines): <code>mode: testing</code>, <code>url</code> for the address the test starts at, and <code>max_steps</code> as a limit on how many steps Kane may take. These are the three the examples here use.
                </li>
                <li>
                  <strong>Title</strong> (<code>#</code>): one line saying what the test proves.
                </li>
                <li>
                  <strong>Steps</strong> (<code>##</code>): each one says what to do, then what must be true afterwards.
                </li>
              </ul>
              <p>{MINIMAL.note}</p>
            </section>

            <section id="rules" data-reveal>
              <h2>
                <span className="dot">02</span>Rules that matter
              </h2>
              <ul>
                {RULES.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>

            <section id="examples" data-reveal>
              <h2>
                <span className="dot">03</span>Examples to copy
              </h2>
              <p>
                Each one has a Copy button. The label says what is actually known: some of these were run through the real Kane CLI and gave the result shown, and the others are written the same way but were not run by us, so check Kane&rsquo;s result on your own app.
              </p>
              {EXAMPLES.map((ex) => (
                <article key={ex.id} id={ex.id} className="example">
                  <h3>
                    {ex.title}{" "}
                    <span className={`tag ${ex.status === "untested" ? "tag-next" : "tag-live"}`}>{STATUS_LABEL[ex.status]}</span>
                  </h3>
                  <p>{ex.note}</p>
                  <CopyCode prompt={false} lines={toLines(ex.content)} />
                  <p className="example-use">
                    In ProofLoop: <em>Add criterion</em>, then <em>Write a new test file</em>, name it <code>{ex.name}</code>, and paste this in.
                  </p>
                </article>
              ))}
            </section>

            <section id="use" data-reveal>
              <h2>
                <span className="dot">04</span>Use one in ProofLoop
              </h2>
              <ol>
                <li>
                  Open the workspace on your machine (<Link href="/run-locally">how to start it</Link>) and create a project with your site&rsquo;s address.
                </li>
                <li>Choose Add criterion. Write the sentence a person could check, and what must be true.</li>
                <li>
                  Choose Write a new test file. The editor opens with a starter that already has your project&rsquo;s address filled in. Replace the steps with your own, or paste one of the examples above and change the address.
                </li>
                <li>Type a short name, such as login, and save. ProofLoop stores it as login_test.md in its own folder, and you never handle a file path.</li>
                <li>Save the criterion and choose Run with Kane. Only a real passing run makes it Verified.</li>
              </ol>
            </section>

            <section id="mistakes" data-reveal>
              <h2>
                <span className="dot">05</span>Common mistakes
              </h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Mistake</th>
                    <th>What happens</th>
                    <th>Do this instead</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>A setting Kane does not know, or a typo in a setting name</td>
                    <td>Kane refuses the file before any step runs (we saw exit code 2 and &ldquo;unknown config key&rdquo;), and ProofLoop shows the run as not started.</td>
                    <td>Copy the settings block from an example above. Set the run time limit in ProofLoop with <code>KANE_TIMEOUT_SECONDS</code>, not in the file.</td>
                  </tr>
                  <tr>
                    <td>A vague check such as &ldquo;make sure it works&rdquo;</td>
                    <td>Kane has to guess what &ldquo;works&rdquo; means, so the result says little.</td>
                    <td>Name what must be on screen: a heading, a button, a message.</td>
                  </tr>
                  <tr>
                    <td>Many unrelated checks in one file</td>
                    <td>One failure hides which part broke.</td>
                    <td>One criterion, one test file.</td>
                  </tr>
                  <tr>
                    <td>A real password or token in the file</td>
                    <td>It is saved on disk and Kane uploads each run to your Test Manager.</td>
                    <td>Use a test account made for this.</td>
                  </tr>
                  <tr>
                    <td>Editing the test to make a failure go away</td>
                    <td>The result no longer tests the original claim.</td>
                    <td>Fix the app. Change the test only if the criterion itself was wrong.</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}
