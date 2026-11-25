// @vitest-environment jsdom
import "./setup-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectList } from "@/components/workspace/ProjectList";
import { apiError, FakeApi, project } from "./helpers/fake-api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("ProjectList", () => {
  let api: FakeApi;
  beforeEach(() => {
    push.mockReset();
    api = new FakeApi();
    api.install();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a busy placeholder, then an empty state that explains what a project is", async () => {
    api.on("GET", /^\/projects$/, () => ({ json: { projects: [] } }));
    render(<ProjectList />);
    expect(screen.getByLabelText("Loading projects")).toBeTruthy();
    expect(await screen.findByText("No projects yet.")).toBeTruthy();
    expect(screen.queryByLabelText("Loading projects")).toBeNull();
  });

  it("lists projects as links to their pages", async () => {
    api.on("GET", /^\/projects$/, () => ({ json: { projects: [project(), project({ id: "p2", name: "Blog" })] } }));
    render(<ProjectList />);
    const link = await screen.findByRole("link", { name: /Demo Shop/ });
    expect(link.getAttribute("href")).toBe("/workspace/projects/p1");
    expect(screen.getByRole("link", { name: /Blog/ }).getAttribute("href")).toBe("/workspace/projects/p2");
  });

  it("renders a load failure with its remedy and recovers on retry", async () => {
    let fail = true;
    api.on("GET", /^\/projects$/, () => (fail ? apiError(500, "STORAGE_ERROR", "Storage failed.") : { json: { projects: [project()] } }));
    render(<ProjectList />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not read or write its local data");
    expect(alert.textContent).toContain("PROOFLOOP_DATA_DIR");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: /Demo Shop/ })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the server is unreachable when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    render(<ProjectList />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not be reached");
    expect(alert.textContent).toContain("npm start");
  });

  it("creates a project with trimmed values and opens it", async () => {
    api.on("GET", /^\/projects$/, () => ({ json: { projects: [] } }));
    api.on("POST", /^\/projects$/, ({ body }) => ({ status: 201, json: { project: project({ id: "p9", ...(body as object) }) } }));
    render(<ProjectList />);
    await screen.findByText("No projects yet.");
    await userEvent.type(screen.getByLabelText("Project name"), "  Shop  ");
    await userEvent.type(screen.getByLabelText("Target URL"), "https://a.test/");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/workspace/projects/p9"));
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Shop", targetUrl: "https://a.test/", notes: null });
  });

  it("shows a server validation message beside the field it names, and keeps what was typed", async () => {
    api.on("GET", /^\/projects$/, () => ({ json: { projects: [] } }));
    api.on("POST", /^\/projects$/, () => apiError(400, "VALIDATION_ERROR", "targetUrl must use http or https.", { field: "targetUrl" }));
    render(<ProjectList />);
    await screen.findByText("No projects yet.");
    await userEvent.type(screen.getByLabelText("Project name"), "Shop");
    await userEvent.type(screen.getByLabelText("Target URL"), "ftp://x");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    const input = screen.getByLabelText("Target URL");
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByText("targetUrl must use http or https.")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("ftp://x");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
