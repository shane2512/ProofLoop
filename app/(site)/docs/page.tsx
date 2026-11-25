import type { Metadata } from "next";
import { CopyCode } from "@/components/site/CopyCode";
import { PageHero } from "@/components/site/PageHero";

export const metadata: Metadata = {
  title: "Docs",
  description: "Install ProofLoop, connect the Kane CLI, place test files, and use the local API.",
};

const SECTIONS = [
  { id: "requirements", label: "Requirements" },
  { id: "install", label: "Install and run" },
  { id: "kane", label: "Connect Kane" },
  { id: "tests", label: "Test files" },
  { id: "config", label: "Configuration" },
  { id: "api", label: "Local API" },
  { id: "testing", label: "Running the tests" },
];

const ENV: Array<[string, string, string]> = [
  ["PROOFLOOP_DATA_DIR", "./data", "Database, raw output, evidence. Point it outside the repository for real use."],
  ["PROOFLOOP_TESTS_DIR", "<data>/tests", "Managed root for _test.md files."],
  ["PROOFLOOP_EVIDENCE_DIR", "<data>/evidence", "Where verified evidence packs are copied."],
  ["KANE_CLI_PATH", "unset", "Optional path to Kane's bin/kane-cli.cjs. .cmd and .bat files are refused."],
  ["KANE_TIMEOUT_SECONDS", "300", "Run time limit, 10 to 1800."],
  ["PROOFLOOP_HOST", "127.0.0.1", "Must be a loopback address."],
  ["PROOFLOOP_PORT", "3000", "Local port."],
];

const API: Array<[string, string, string]> = [
  ["GET", "/api/v1/health", "Storage status."],
  ["GET / POST", "/api/v1/projects", "List or create projects."],
  ["GET / PATCH / DELETE", "/api/v1/projects/:id", "Read, edit or archive a project."],
  ["POST", "/api/v1/projects/:id/criteria", "Create a criterion (at most five active)."],
  ["PATCH / DELETE", "/api/v1/projects/:id/criteria/:criterionId", "Edit or soft-delete a criterion."],
  ["POST", "/api/v1/projects/:id/criteria/:criterionId/runs", "Start a run. Body must be {}. Returns 202."],
  ["GET", "/api/v1/projects/:id/runs", "Run history, newest first, paginated."],
  ["GET", "/api/v1/runs/:runId", "Run detail, events and evidence."],
  ["POST", "/api/v1/runs/:runId/cancel", "Cancel the active run."],
  ["GET", "/api/v1/runs/:runId/output?stream=", "Saved, redacted stdout or stderr."],
  ["GET", "/api/v1/runs/:runId/report?format=", "Markdown or JSON report. includeOutput=true adds raw output to the JSON only."],
  ["GET", "/api/v1/runs/:runId/evidence", "Evidence references, re-checked against the disk."],
  ["GET", "/api/v1/runs/:runId/evidence/:evidenceId", "Download one verified evidence file."],
  ["GET", "/api/v1/runs/compare?a=&b=", "Recorded differences between two runs of one criterion."],
  ["GET / PUT", "/api/v1/projects/:id/test-files/:name", "Read or write a Kane test file in the managed folder."],
];

export default function DocsPage() {
  return (
    <>
      <PageHero compact eyebrow="Setup guide" title="Up in Ten Minutes." note="Node, Chrome, the Kane CLI and a test file. Everything runs on your machine." cta={{ href: "/workspace", label: "Open Workspace" }} />
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
            <section id="requirements" data-reveal>
              <h2>
                <span className="dot">01</span>Requirements
              </h2>
              <ul>
                <li>Node.js 26.12.1 (pinned in <code>.nvmrc</code>) and npm.</li>
                <li>Google Chrome, launchable by Kane.</li>
                <li>kane-cli 0.10.9, a TestMu account with credits, and an app you are allowed to test.</li>
              </ul>
            </section>

            <section id="install" data-reveal>
              <h2>
                <span className="dot">02</span>Install and run
              </h2>
              <p>From the <code>proofloop-app</code> folder:</p>
              <CopyCode lines={["npm ci", "npm run build", "npm start"]} />
              <p>
                Then open <code>http://127.0.0.1:3000</code>. The server only listens on loopback; do not expose it to a network.
              </p>
            </section>

            <section id="kane" data-reveal>
              <h2>
                <span className="dot">03</span>Connect Kane
              </h2>
              <CopyCode lines={["npm install -g @testmuai/kane-cli", "kane-cli login", "kane-cli whoami", "kane-cli balance"]} />
              <p>ProofLoop never stores your Kane credentials. They stay in Kane&rsquo;s own profile.</p>
            </section>

            <section id="tests" data-reveal>
              <h2>
                <span className="dot">04</span>Test files
              </h2>
              <p>
                Put each test at <code>&lt;PROOFLOOP_TESTS_DIR&gt;/&lt;project-id&gt;/&lt;name&gt;_test.md</code> and map one criterion to it. A minimal file:
              </p>
              <CopyCode
                lines={[
                  "# login_test.md",
                  "---",
                  "mode: testing",
                  "url: https://www.saucedemo.com/",
                  "---",
                  "## Sign in",
                  'Type "standard_user" and "secret_sauce", click Login.',
                  'Verify the page shows the "Products" heading.',
                ]}
              />
              <p>Editing a test after it passed makes the criterion UNVERIFIED until it passes again.</p>
            </section>

            <section id="config" data-reveal>
              <h2>
                <span className="dot">05</span>Configuration
              </h2>
              <p>Copy <code>.env.example</code> to <code>.env</code>. Never put credentials there.</p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Default</th>
                    <th>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {ENV.map(([name, def, purpose]) => (
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
            </section>

            <section id="api" data-reveal>
              <h2>
                <span className="dot">06</span>Local API
              </h2>
              <p>JSON over loopback. Mutations reject cross-site requests, unknown fields and bodies over 64 KiB. No endpoint accepts a command, a path or a credential.</p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Path</th>
                    <th>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {API.map(([method, path, purpose]) => (
                    <tr key={path + method}>
                      <td>{method}</td>
                      <td>
                        <code>{path}</code>
                      </td>
                      <td>{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section id="testing" data-reveal>
              <h2>
                <span className="dot">07</span>Running the tests
              </h2>
              <CopyCode lines={["npm test", "# Real Kane runs: uses credits and uploads to Test Manager", "npm run test:live-kane"]} />
              <p>The normal suite never calls Kane. The live suite is opt-in and needs an authenticated Kane CLI and Chrome.</p>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}
