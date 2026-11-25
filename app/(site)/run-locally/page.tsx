import type { Metadata } from "next";
import Link from "next/link";
import { CopyCode } from "@/components/site/CopyCode";
import { PageHero } from "@/components/site/PageHero";

export const metadata: Metadata = {
  title: "Run it on your machine",
  description: "ProofLoop drives the Kane CLI and Chrome, so it runs on your own computer. Install Kane, log in, clone, build, start.",
};

const SECTIONS = [
  { id: "needs", label: "What you need" },
  { id: "kane", label: "Install and log in to Kane" },
  { id: "run", label: "Get and start ProofLoop" },
  { id: "config", label: "Configure (optional)" },
  { id: "first", label: "Your first run" },
  { id: "trouble", label: "If something fails" },
  { id: "demo", label: "Try the demo" },
  { id: "nocredits", label: "Without credits" },
];

const CONFIG: Array<[string, string, string]> = [
  ["PROOFLOOP_DATA_DIR", "./data", "Where the database, raw output and evidence live. Point it outside the repository for real use."],
  ["KANE_CLI_PATH", "unset", "Only if Kane is not found automatically. Path to Kane's bin/kane-cli.cjs; .cmd and .bat files are refused."],
  ["KANE_TIMEOUT_SECONDS", "300", "Stops a run that takes too long (10 to 1800). A new test's first run can take two minutes or more, so raise it if runs time out."],
];

const TROUBLE: Array<[string, string]> = [
  ["\u201CKane CLI was not found\u201D when starting a run", "Install it (step 2) and open a new terminal so the install is on your PATH. If it is installed somewhere unusual, set KANE_CLI_PATH."],
  ["A run ends as Not started, or fails before any step", "Run kane-cli whoami. If you are not logged in, run kane-cli login again. kane-cli balance shows your remaining credits."],
  ["A run shows Timed out", "ProofLoop stopped it at KANE_TIMEOUT_SECONDS. That is not a pass or a fail. Raise the limit and run again."],
  ["The target site cannot be reached", "Kane drives your own Chrome from your machine. Open the target URL in Chrome yourself first. A local app has to be running."],
  ["Port 3000 is already in use", "Stop the other program, or start on another port with: npx next start -H 127.0.0.1 -p 3001"],
  ["npm ci or the build fails", "Check node --version. It was built and tested on 26.12.1; the repository pins it in .nvmrc."],
];

export default function RunLocallyPage() {
  return (
    <>
      <PageHero
        compact
        eyebrow="The workspace is local"
        title="Run It On Your Machine."
        note="ProofLoop starts Kane and Chrome and keeps your history on disk, so the workspace only runs on your own computer."
        cta={{ href: "/docs", label: "Full Setup Guide" }}
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
            <section id="needs" data-reveal>
              <h2>
                <span className="dot">01</span>What you need
              </h2>
              <ul>
                <li>
                  <strong>Node.js 26.12.1</strong> and npm. This is the version it was built and tested on. Check with <code>node --version</code>.
                </li>
                <li>
                  <strong>Git</strong> and <strong>Google Chrome</strong>. Kane opens Chrome itself, in the background, to run each test.
                </li>
                <li>
                  <strong>A TestMu account with Kane credits.</strong> Every real run uses credits, and Kane uploads it to your own Test Manager. ProofLoop cannot tell you what a run will cost.
                </li>
                <li>An app you are allowed to test. Use a public demo such as saucedemo.com, or the demo shop in the repository.</li>
              </ul>
              <p>
                It has only been tried on Windows. This page is the public showcase: it has no Kane, no browser and no storage, and its API is switched off on purpose so nobody can start runs on a stranger&rsquo;s behalf.
              </p>
            </section>

            <section id="kane" data-reveal>
              <h2>
                <span className="dot">02</span>Install and log in to Kane
              </h2>
              <p>Kane is a separate tool that ProofLoop runs for you. Install it once, then log in once:</p>
              <CopyCode lines={["npm install -g @testmuai/kane-cli", "kane-cli login", "kane-cli whoami", "kane-cli balance"]} />
              <ul>
                <li>
                  <code>kane-cli login</code> signs you in to your TestMu account and saves a profile on your machine. Follow its prompts.
                </li>
                <li>
                  <code>kane-cli whoami</code> confirms you are logged in. <code>kane-cli balance</code> shows your credits. Run both before your first test.
                </li>
                <li>ProofLoop never reads or stores your Kane login. It stays in Kane&rsquo;s own profile, and ProofLoop passes Kane only the settings it needs.</li>
                <li>
                  Tested with kane-cli <strong>0.10.9</strong>. A newer version may behave differently. To match it exactly: <code>npm install -g @testmuai/kane-cli@0.10.9</code>.
                </li>
              </ul>
            </section>

            <section id="run" data-reveal>
              <h2>
                <span className="dot">03</span>Get and start ProofLoop
              </h2>
              <CopyCode lines={["git clone https://github.com/shane2512/ProofLoop.git", "cd ProofLoop", "npm ci", "npm run build", "npm start"]} />
              <p>
                When it says it is ready, open <code>http://127.0.0.1:3000/workspace</code> in your browser. The server only listens on your own machine and refuses any other address. Leave the terminal open while you use it, and press Ctrl+C to stop.
              </p>
            </section>

            <section id="config" data-reveal>
              <h2>
                <span className="dot">04</span>Configure (optional)
              </h2>
              <p>
                The defaults work, so you can skip this. To change a setting, copy the example file and edit it, then restart <code>npm start</code>:
              </p>
              <CopyCode lines={["copy .env.example .env"]} />
              <table className="table">
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Default</th>
                    <th>What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {CONFIG.map(([name, def, purpose]) => (
                    <tr key={name}>
                      <td>
                        <code>{name}</code>
                      </td>
                      <td>{def}</td>
                      <td>{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Never put Kane or TestMu credentials in <code>.env</code>; <code>kane-cli login</code> is the only place they belong. The other settings are in the <Link href="/docs#config">setup guide</Link>.
              </p>
            </section>

            <section id="first" data-reveal>
              <h2>
                <span className="dot">05</span>Your first run
              </h2>
              <ol>
                <li>
                  In the workspace, create a project with a name and the site&rsquo;s URL, for example <code>https://www.saucedemo.com/</code>.
                </li>
                <li>Choose Add criterion. Write one sentence a person could check, and what must be true when it passes.</li>
                <li>Choose Write a new test file, keep the starter text or adjust it, and save. ProofLoop stores it in its own folder for you.</li>
                <li>Save the criterion, then choose Run with Kane and confirm. It is a real run and uses credits.</li>
                <li>
                  Wait for the result. A new test&rsquo;s first run is authored by Kane and can take two to four minutes. The status stays Running until Kane finishes, and nothing counts as passed before then.
                </li>
              </ol>
              <p>
                When a run finishes you can read Kane&rsquo;s steps and output, download the evidence file, and copy a report to give to your own coding agent. A criterion shows Verified only after a real passing run.
              </p>
            </section>

            <section id="trouble" data-reveal>
              <h2>
                <span className="dot">06</span>If something fails
              </h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>What you see</th>
                    <th>What to do</th>
                  </tr>
                </thead>
                <tbody>
                  {TROUBLE.map(([symptom, fix]) => (
                    <tr key={symptom}>
                      <td>{symptom}</td>
                      <td>{fix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section id="demo" data-reveal>
              <h2>
                <span className="dot">07</span>Try the closed-loop demo
              </h2>
              <p>A small shop with one planted login bug. Two real Kane runs: a failure and a report, then a fix and a pass. It uses credits. Run these from the ProofLoop folder, after the build in step 3:</p>
              <CopyCode lines={["node scripts\\demo-loop.mjs fail", "# read docs/demo/closed-loop/01-fail-report.md", "# apply the fix described in demo/README.md", "node scripts\\demo-loop.mjs pass"]} />
              <p>
                The full steps are in <code>demo/README.md</code> in the repository.
              </p>
            </section>

            <section id="nocredits" data-reveal>
              <h2>
                <span className="dot">08</span>Check it without credits
              </h2>
              <CopyCode lines={["npm test"]} />
              <p>
                Runs the application tests with a fake Kane process. They never contact Kane and never count as verification. See <Link href="/evidence">what a real run records</Link> and <Link href="/workflow">the build status</Link>.
              </p>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}
