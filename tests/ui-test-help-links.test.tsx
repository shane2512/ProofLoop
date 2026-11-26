// @vitest-environment jsdom
import "./setup-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectView } from "@/components/workspace/ProjectView";
import { FakeApi, project } from "./helpers/fake-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

// Label: ProofLoop application test (UI). The "Don't know how to write a test script?" help must be reachable
// from every place a person is stuck: the empty project, the criterion form and the test editor.
describe("test-writing help links", () => {
  let api: FakeApi;
  beforeEach(() => {
    api = new FakeApi();
    api.install();
    api.on("GET", /^\/projects\/p1$/, () => ({ json: { project: project(), criteria: [] } }));
    api.on("GET", /^\/projects\/p1\/runs$/, () => ({ json: { runs: [], nextCursor: null } }));
    api.on("GET", /^\/projects\/p1\/test-files$/, () => ({ json: { files: [] } }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is on the empty project and goes to the examples page", async () => {
    render(<ProjectView projectId="p1" />);
    await screen.findByText("Nothing to verify yet.");
    const link = screen.getByRole("link", { name: /Click here for the format and examples you can copy/ });
    expect(link.getAttribute("href")).toBe("/test-examples");
    expect(link.closest("p")?.textContent).toContain("Don't know how to write a test script?");
  });

  it("is in the criterion form and opens in a new tab so the form is not lost", async () => {
    render(<ProjectView projectId="p1" />);
    await screen.findByText("Nothing to verify yet.");
    await userEvent.click(screen.getByRole("button", { name: "Add criterion" }));
    const dialog = await screen.findByRole("dialog");
    const link = within(dialog).getByRole("link", { name: "Click here for examples" });
    expect(link.getAttribute("href")).toBe("/test-examples");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("is in the test editor too, next to the starter text", async () => {
    render(<ProjectView projectId="p1" />);
    await screen.findByText("Nothing to verify yet.");
    await userEvent.click(screen.getByRole("button", { name: "Add criterion" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Write a new test file" }));
    const link = within(dialog).getByRole("link", { name: /format and examples you can copy/ });
    expect(link.getAttribute("href")).toBe("/test-examples");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.closest("p")?.textContent).toContain("so your work here is kept");
    expect((within(dialog).getByLabelText("Test") as HTMLTextAreaElement).value).toContain("mode: testing");
  });
});
