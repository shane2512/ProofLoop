// @vitest-environment jsdom
import "./setup-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectView } from "@/components/workspace/ProjectView";
import type { Criterion } from "@/lib/api-types";
import { apiError, criterion, FakeApi, kane, project, runDetail, runSummary } from "./helpers/fake-api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const WAIT = { timeout: 6000 };

describe("ProjectView", () => {
  let api: FakeApi;
  let criteria: Criterion[];

  function setup(initial: Criterion[] = [criterion()]) {
    criteria = initial;
    api.on("GET", /^\/projects\/p1$/, () => ({ json: { project: project(), criteria } }));
    api.on("GET", /^\/projects\/p1\/runs$/, () => ({ json: { runs: [], nextCursor: null } }));
    api.on("GET", /^\/projects\/p1\/test-files$/, () => ({ json: { files: [{ name: "login", testFile: "p1/login_test.md", sizeBytes: 10, modifiedAt: "2026-11-25T10:00:00.000Z" }] } }));
    return render(<ProjectView projectId="p1" />);
  }

  beforeEach(() => {
    push.mockReset();
    api = new FakeApi();
    api.install();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("criteria", () => {
    it("shows each criterion with its derived status and what that status means", async () => {
      setup([
        criterion({ id: "a", title: "A", status: "VERIFIED" }),
        criterion({ id: "b", title: "B", status: "FAILED" }),
        criterion({ id: "c", title: "C", status: "UNVERIFIED" }),
      ]);
      await screen.findByText("A");
      const labels = Array.from(document.querySelectorAll(".ws-badge")).map((n) => n.textContent);
      expect(labels).toEqual(["Verified", "Failed", "Unverified"]);
      expect(screen.getByTestId("readiness").textContent).toContain("1 of 3 verified by a real Kane run");
    });

    it("explains a stale pass instead of showing it as verified", async () => {
      setup([criterion({ status: "UNVERIFIED", statusNote: "TEST_FILE_CHANGED", lastRunId: "r1" })]);
      await screen.findByText("Login reaches inventory");
      expect(screen.queryByText("Verified")).toBeNull();
      expect(screen.getByText(/test file was edited after the last passing run/i)).toBeTruthy();
    });

    it("tells the person how many more criteria are needed before the project is ready", async () => {
      setup([criterion()]);
      await screen.findByText("Login reaches inventory");
      expect(screen.getByTestId("readiness").textContent).toContain("1 of 3 criteria. Add 2 more");
    });

    it("shows an empty state that says nothing is verified without a Kane pass", async () => {
      setup([]);
      expect(await screen.findByText("Nothing to verify yet.")).toBeTruthy();
      expect(document.querySelector(".ws-badge")).toBeNull();
    });

    it("disables Add criterion at the five-criterion limit and says why", async () => {
      setup([1, 2, 3, 4, 5].map((n) => criterion({ id: `c${n}`, title: `Criterion ${n}` })));
      await screen.findByText("Criterion 1");
      expect((screen.getByRole("button", { name: "Add criterion" }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId("readiness").textContent).toContain("at most five criteria");
    });

    it("adds a criterion mapped to an existing test file", async () => {
      api.on("POST", /^\/projects\/p1\/criteria$/, ({ body }) => ({ status: 201, json: { criterion: criterion({ id: "new", ...(body as object) }) } }));
      setup([]);
      await screen.findByText("Nothing to verify yet.");
      await userEvent.click(screen.getByRole("button", { name: "Add criterion" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Criterion"), "Cart works");
      await userEvent.type(within(dialog).getByLabelText("Expected behavior"), "Item appears in cart.");
      await waitFor(() => expect(within(dialog).getByRole("option", { name: "login" })).toBeTruthy());
      await userEvent.selectOptions(within(dialog).getByLabelText("Test file"), "p1/login_test.md");
      await userEvent.click(within(dialog).getByRole("button", { name: "Add criterion" }));
      await waitFor(() => expect(api.calls.some((c) => c.method === "POST" && c.path === "/projects/p1/criteria")).toBe(true));
      expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({
        title: "Cart works",
        expectedBehavior: "Item appears in cart.",
        notes: null,
        testFile: "p1/login_test.md",
        stepLabel: null,
      });
    });

    it("writes a new test file from the criterion form and selects it", async () => {
      api.on("PUT", /^\/projects\/p1\/test-files\/smoke$/, ({ body }) => ({
        json: { file: { name: "smoke", testFile: "p1/smoke_test.md", sizeBytes: (body as { content: string }).content.length, modifiedAt: "2026-11-25T10:00:00.000Z" } },
      }));
      setup([]);
      await screen.findByText("Nothing to verify yet.");
      await userEvent.click(screen.getByRole("button", { name: "Add criterion" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Write a new test file" }));
      expect((within(dialog).getByLabelText("Test") as HTMLTextAreaElement).value).toContain("url: https://www.saucedemo.com/");
      await userEvent.type(within(dialog).getByLabelText("File name"), "smoke");
      await userEvent.click(within(dialog).getByRole("button", { name: "Save test file" }));
      await waitFor(() => expect(api.count("PUT", /test-files\/smoke$/)).toBe(1));
      // Back on the criterion form with the new file chosen.
      await waitFor(() => expect(within(dialog).getByLabelText("Criterion")).toBeTruthy());
      await waitFor(() => expect((within(dialog).getByLabelText("Test file") as HTMLSelectElement).value).toBe("p1/smoke_test.md"));
    });

    it("renders the server's TEST_MAPPING_INVALID rejection on the form", async () => {
      api.on("POST", /^\/projects\/p1\/criteria$/, () => apiError(400, "VALIDATION_ERROR", "testFile must end in _test.md.", { field: "testFile" }));
      setup([]);
      await screen.findByText("Nothing to verify yet.");
      await userEvent.click(screen.getByRole("button", { name: "Add criterion" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Criterion"), "X");
      await userEvent.type(within(dialog).getByLabelText("Expected behavior"), "Y");
      await userEvent.click(within(dialog).getByRole("button", { name: "Add criterion" }));
      expect(await within(dialog).findByText("testFile must end in _test.md.")).toBeTruthy();
      expect(within(dialog).getByLabelText("Test file").getAttribute("aria-invalid")).toBe("true");
    });

    it("deletes a criterion only after confirmation, and says history is kept", async () => {
      api.on("DELETE", /^\/projects\/p1\/criteria\/c1$/, () => ({ status: 204 }));
      setup();
      await screen.findByText("Login reaches inventory");
      await userEvent.click(screen.getByRole("button", { name: "Delete: Login reaches inventory" }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/past runs stay in the history/)).toBeTruthy();
      expect(api.count("DELETE", /criteria/)).toBe(0);
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete criterion" }));
      await waitFor(() => expect(api.count("DELETE", /criteria\/c1$/)).toBe(1));
    });
  });

  describe("project page states", () => {
    it("shows a busy placeholder while loading", async () => {
      api.on("GET", /^\/projects\/p1$/, () => new Promise(() => {}));
      api.on("GET", /^\/projects\/p1\/runs$/, () => ({ json: { runs: [], nextCursor: null } }));
      render(<ProjectView projectId="p1" />);
      expect(screen.getByLabelText("Loading project")).toBeTruthy();
    });

    it("says the project is gone on 404 and offers the way back, without a pointless retry", async () => {
      api.on("GET", /^\/projects\/p1$/, () => apiError(404, "NOT_FOUND", "Project not found."));
      render(<ProjectView projectId="p1" />);
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Project not found.");
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
      expect(screen.getByRole("link", { name: "Back to projects" }).getAttribute("href")).toBe("/workspace");
    });

    it("archives after confirmation and returns to the list", async () => {
      api.on("DELETE", /^\/projects\/p1$/, () => ({ status: 204 }));
      setup();
      await screen.findByText("Login reaches inventory");
      await userEvent.click(screen.getByRole("button", { name: "Archive" }));
      await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Archive project" }));
      await waitFor(() => expect(push).toHaveBeenCalledWith("/workspace"));
    });
  });

  describe("running a criterion", () => {
    async function openConfirm() {
      await screen.findByText("Login reaches inventory");
      await userEvent.click(screen.getByRole("button", { name: "Run with Kane: Login reaches inventory" }));
      return screen.findByRole("dialog");
    }

    it("asks for confirmation that states it is a real, credit-using Kane run, and starts nothing before that", async () => {
      setup();
      const dialog = await openConfirm();
      const text = dialog.textContent ?? "";
      expect(text).toContain("real Kane browser run");
      expect(text).toContain("not a simulation");
      expect(text).toContain("credits");
      expect(text).toContain("Test Manager");
      expect(text).toContain("https://www.saucedemo.com/");
      expect(api.count("POST", /runs$/)).toBe(0);
    });

    it("cancelling the confirmation starts no run", async () => {
      setup();
      const dialog = await openConfirm();
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(api.count("POST", /runs$/)).toBe(0);
    });

    it("starts a run, shows it as running with no pass, polls, and then shows the recorded result", async () => {
      let polls = 0;
      api.on("POST", /^\/projects\/p1\/criteria\/c1\/runs$/, () => {
        criteria = [criterion({ status: "RUNNING", lastRunId: "r1" })];
        return { status: 202, json: { runId: "r1", status: "QUEUED" } };
      });
      api.on("GET", /^\/runs\/r1$/, () => {
        polls += 1;
        if (polls < 3) return { json: runDetail({ status: "RUNNING" }) };
        criteria = [criterion({ status: "VERIFIED", lastRunId: "r1" })];
        return {
          json: runDetail(
            { status: "PASSED", exitCode: 0, durationMs: 12_300, finishedAt: "2026-11-25T10:00:12.000Z", summary: "Kane reported a pass.", evidenceAvailable: true },
            {
              kane: kane(),
              evidence: [{ id: "e1", kind: "EVIDENCE_PACK", label: "Kane evidence pack", available: true, source: "event", relativePath: "evidence/r1/pack.zip", unavailableReason: null }],
              command: ["node", "kane-cli.cjs", "testmd", "run", "login_test.md", "--agent", "--headless"],
            },
          ),
        };
      });
      setup();
      const dialog = await openConfirm();
      await userEvent.click(within(dialog).getByRole("button", { name: "Start real run" }));

      // While it runs: running, explicitly not a pass, cancel offered, run buttons locked.
      const panel = await screen.findByRole("region", { name: "Run" });
      await waitFor(() => expect(within(panel).getByRole("status").textContent).toContain("Running"));
      expect(within(panel).getByText(/Nothing here is a pass until then/)).toBeTruthy();
      expect(within(panel).getByRole("button", { name: "Cancel run" })).toBeTruthy();
      expect(within(panel).queryByText("Passed")).toBeNull();
      expect(screen.queryByText("Verified")).toBeNull();
      await waitFor(() => expect((screen.getByRole("button", { name: /Run with Kane|Running/ }) as HTMLButtonElement).disabled).toBe(true));

      // Once the record says PASSED: result, Kane's steps, evidence, and the criterion becomes verified.
      await waitFor(() => expect(within(panel).getByRole("status").textContent).toContain("Passed"), WAIT);
      expect(within(panel).getByText("Open the login page")).toBeTruthy();
      expect(within(panel).getByText(/Saved in ProofLoop's data folder: evidence\/r1\/pack\.zip/)).toBeTruthy();
      expect(within(panel).queryByRole("button", { name: "Cancel run" })).toBeNull();
      await waitFor(() => expect(document.querySelector('.ws-criterion .ws-badge')?.textContent).toBe("Verified"), WAIT);
      expect(api.count("POST", /\/runs$/)).toBe(1);
    }, 15_000);

    it("reports a failure with Kane's diagnosis labelled as Kane's, and never as verified", async () => {
      api.on("POST", /\/runs$/, () => {
        criteria = [criterion({ status: "FAILED", lastRunId: "r1" })];
        return { status: 202, json: { runId: "r1", status: "QUEUED" } };
      });
      api.on("GET", /^\/runs\/r1$/, () => ({
        json: runDetail(
          { status: "FAILED", exitCode: 1, errorCode: "EXIT_NONZERO", finishedAt: "2026-11-25T10:00:12.000Z" },
          {
            kane: kane({
              done: { overallStatus: "failed", durationS: 9, sessionId: null },
              failure: {
                reason: "Assertion did not hold",
                reasonCode: null,
                resultCode: null,
                summary: "The Products heading was not found.",
                oneLiner: null,
                kaneVerdict: { rootCause: "Login was rejected", suggestion: "Check the password", confidence: 0.5, family: null, category: null, severity: null },
              },
            }),
          },
        ),
      }));
      setup();
      const dialog = await openConfirm();
      await userEvent.click(within(dialog).getByRole("button", { name: "Start real run" }));
      const panel = await screen.findByRole("region", { name: "Run" });
      await waitFor(() => expect(within(panel).getByRole("status").textContent).toContain("Failed"));
      expect(within(panel).getByText(/Kane's diagnosis \(not ProofLoop's\)/)).toBeTruthy();
      expect(within(panel).getByText("Login was rejected")).toBeTruthy();
      expect(within(panel).getByText(/has not checked the cause/)).toBeTruthy();
      expect(within(panel).getByText(/Kane exited with a failure code/)).toBeTruthy();
      expect(screen.queryByText("Verified")).toBeNull();
    });

    it.each([
      [409, "RUNNER_BUSY", "A run is already active.", "Another run is already in progress"],
      [424, "PREREQUISITE_FAILED", "Kane is not logged in.", "kane-cli whoami"],
      [422, "TEST_MAPPING_INVALID", "The mapped test file does not exist.", "map it to a test file that exists"],
    ])("explains a %i %s refusal inside the confirmation and starts no run", async (status, code, message, expected) => {
      api.on("POST", /\/runs$/, () => apiError(status, code, message));
      setup();
      const dialog = await openConfirm();
      await userEvent.click(within(dialog).getByRole("button", { name: "Start real run" }));
      const alert = await within(dialog).findByRole("alert");
      expect(alert.textContent).toContain(expected);
      expect(screen.queryByRole("region", { name: "Run" })).toBeNull();
    });

    it("keeps the last record visible, says contact was lost, and recovers when the server answers again", async () => {
      let n = 0;
      api.on("POST", /\/runs$/, () => {
        criteria = [criterion({ status: "RUNNING", lastRunId: "r1" })];
        return { status: 202, json: { runId: "r1", status: "QUEUED" } };
      });
      api.on("GET", /^\/runs\/r1$/, () => {
        n += 1;
        if (n === 2) return apiError(500, "INTERNAL_ERROR", "Internal error.");
        if (n >= 4) return { json: runDetail({ status: "CANCELED", canceled: true, finishedAt: "2026-11-25T10:01:00.000Z" }) };
        return { json: runDetail({ status: "RUNNING" }) };
      });
      setup();
      const dialog = await openConfirm();
      await userEvent.click(within(dialog).getByRole("button", { name: "Start real run" }));
      const panel = await screen.findByRole("region", { name: "Run" });
      expect(await within(panel).findByText("Lost contact with ProofLoop.", {}, WAIT)).toBeTruthy();
      expect(within(panel).getByRole("status").textContent).toContain("Running");
      expect(within(panel).getByText(/may still be going/)).toBeTruthy();
      await waitFor(() => expect(within(panel).getByRole("status").textContent).toContain("Canceled"), { timeout: 12_000 });
      expect(within(panel).queryByText("Lost contact with ProofLoop.")).toBeNull();
    }, 20_000);

    it("requests cancellation and does not claim the run is canceled until the record says so", async () => {
      api.on("POST", /\/runs$/, () => {
        criteria = [criterion({ status: "RUNNING", lastRunId: "r1" })];
        return { status: 202, json: { runId: "r1", status: "QUEUED" } };
      });
      api.on("GET", /^\/runs\/r1$/, () => ({ json: runDetail({ status: "RUNNING" }) }));
      api.on("POST", /^\/runs\/r1\/cancel$/, () => ({ status: 202, json: { runId: "r1", status: "CANCEL_REQUESTED" } }));
      setup();
      const dialog = await openConfirm();
      await userEvent.click(within(dialog).getByRole("button", { name: "Start real run" }));
      const panel = await screen.findByRole("region", { name: "Run" });
      await userEvent.click(await within(panel).findByRole("button", { name: "Cancel run" }));
      expect(await within(panel).findByText(/marked canceled only once the process has actually stopped/)).toBeTruthy();
      expect(within(panel).getByRole("status").textContent).toContain("Running");
      expect(within(panel).getByRole("status").textContent).not.toContain("Canceled");
    });

    it("resumes watching a run that is already active when the page opens", async () => {
      api.on("GET", /^\/runs\/r7$/, () => ({ json: runDetail({ id: "r7", status: "RUNNING" }) }));
      setup([criterion({ status: "RUNNING", lastRunId: "r7" })]);
      const panel = await screen.findByRole("region", { name: "Run" });
      await waitFor(() => expect(within(panel).getByRole("status").textContent).toContain("Running"));
      expect(within(panel).getByRole("button", { name: "Cancel run" })).toBeTruthy();
    });
  });

  describe("raw output and history", () => {
    it("fetches raw output only when it is opened, and says when none was saved", async () => {
      api.on("GET", /^\/runs\/r1$/, () => ({ json: runDetail({ status: "FAILED", exitCode: 1, finishedAt: "2026-11-25T10:00:12.000Z" }) }));
      api.on("GET", /^\/runs\/r1\/output$/, ({ query }) =>
        query.get("stream") === "stdout" ? { text: '{"type":"test_md_done"}\n' } : apiError(404, "OUTPUT_UNAVAILABLE", "Output was not saved for this run."),
      );
      setup([criterion({ status: "FAILED", lastRunId: "r1" })]);
      await userEvent.click(await screen.findByRole("button", { name: "Latest run: Login reaches inventory" }));
      const panel = await screen.findByRole("region", { name: "Run" });
      await waitFor(() => expect(within(panel).getByRole("status").textContent).toContain("Failed"));
      expect(api.count("GET", /output/)).toBe(0);

      const stdout = within(panel).getByText("Raw stdout").closest("details") as HTMLDetailsElement;
      stdout.open = true;
      fireEvent(stdout, new Event("toggle"));
      expect(await within(panel).findByLabelText("Raw stdout")).toBeTruthy();
      expect(within(panel).getByLabelText("Raw stdout").textContent).toContain("test_md_done");

      const stderr = within(panel).getByText("Raw stderr").closest("details") as HTMLDetailsElement;
      stderr.open = true;
      fireEvent(stderr, new Event("toggle"));
      expect(await within(panel).findByText("No output was saved for this run.")).toBeTruthy();
      expect(api.count("GET", /output\?stream=stdout/)).toBe(1);
    });

    it("lists run history and loads older pages on request", async () => {
      const page1 = [runSummary({ id: "r3", status: "PASSED" }), runSummary({ id: "r2", status: "FAILED" })];
      const page2 = [runSummary({ id: "r1", status: "CANCELED" })];
      api.on("GET", /^\/projects\/p1\/runs$/, ({ query }) =>
        query.get("cursor") ? { json: { runs: page2, nextCursor: null } } : { json: { runs: page1, nextCursor: "next" } },
      );
      api.on("GET", /^\/projects\/p1$/, () => ({ json: { project: project(), criteria: [criterion()] } }));
      render(<ProjectView projectId="p1" />);
      const history = await screen.findByRole("region", { name: "Run history" });
      await waitFor(() => expect(within(history).getAllByRole("button", { pressed: false })).toHaveLength(2));
      await userEvent.click(within(history).getByRole("button", { name: "Load older runs" }));
      await waitFor(() => expect(within(history).getAllByText(/Canceled/)).toHaveLength(1));
      expect(within(history).queryByRole("button", { name: "Load older runs" })).toBeNull();
      expect(api.calls.some((c) => c.path.includes("cursor=next"))).toBe(true);
    });
  });

  describe("keyboard", () => {
    it("opens a dialog from the keyboard, closes it with Escape, and returns focus to the button that opened it", async () => {
      setup();
      await screen.findByText("Login reaches inventory");
      const opener = screen.getByRole("button", { name: "Run with Kane: Login reaches inventory" });
      opener.focus();
      await userEvent.keyboard("{Enter}");
      const dialog = await screen.findByRole("dialog");
      expect(dialog.hasAttribute("open")).toBe(true);
      // The browser fires "cancel" on Escape for a modal dialog; jsdom does not, so dispatch it.
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      await waitFor(() => expect(document.querySelector("dialog.ws-dialog[open]")).toBeNull());
      expect(document.activeElement).toBe(opener);
      expect(api.count("POST", /runs$/)).toBe(0);
    });

    it("labels every control so a screen reader can tell the criteria apart", async () => {
      setup([criterion({ id: "a", title: "First" }), criterion({ id: "b", title: "Second" })]);
      await screen.findByText("First");
      for (const verb of ["Run with Kane", "Edit", "Delete"]) {
        expect(screen.getByRole("button", { name: `${verb}: First` })).toBeTruthy();
        expect(screen.getByRole("button", { name: `${verb}: Second` })).toBeTruthy();
      }
    });
  });
});
