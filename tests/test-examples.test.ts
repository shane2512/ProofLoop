import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXAMPLES, KNOWN_KEYS, MINIMAL, RULES, STATUS_LABEL } from "@/lib/test-examples";
import { MAX_TEST_CONTENT_BYTES, parseTestFileWrite, validateTestName } from "@/server/test-files";
import { starterTest } from "@/components/workspace/TestFileEditor";

// Label: ProofLoop application test. It checks the examples shown to users; it does not run Kane.
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const all = [MINIMAL, ...EXAMPLES];

function frontMatter(content: string): { keys: string[]; body: string } | null {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);
  if (!m) return null;
  const keys = (m[1] ?? "").split("\n").map((l) => l.split(":")[0]?.trim() ?? "");
  return { keys, body: m[2] ?? "" };
}

describe("example test files shown to users", () => {
  it.each(all.map((e) => [e.id, e] as const))("%s starts with a settings block and uses only the tested keys", (_id, ex) => {
    const fm = frontMatter(ex.content);
    expect(fm, "front matter must be the very first thing in the file").not.toBeNull();
    expect(fm?.keys.every((k) => (KNOWN_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(fm?.keys).toEqual(expect.arrayContaining(["mode", "url"]));
  });

  it.each(all.map((e) => [e.id, e] as const))("%s has a title and at least one step", (_id, ex) => {
    const body = frontMatter(ex.content)?.body ?? "";
    expect(body).toMatch(/^\s*# \S/m);
    expect(body.match(/^## \S/gm)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it.each(all.map((e) => [e.id, e] as const))("%s can be saved by ProofLoop as written", (_id, ex) => {
    expect(() => validateTestName(ex.name)).not.toThrow();
    expect(parseTestFileWrite({ content: ex.content })).toBe(ex.content);
    expect(Buffer.byteLength(ex.content, "utf8")).toBeLessThan(MAX_TEST_CONTENT_BYTES);
  });

  it("labels as 'ran with real Kane' only files identical to the ones that were run", () => {
    const ran: Record<string, string> = {
      "login-pass": "tests/kane-smoke/login_pass_test.md",
      "deliberate-fail": "tests/kane-smoke/login_fail_test.md",
      "demo-shop": "demo/shop/login_test.md",
    };
    for (const ex of EXAMPLES.filter((e) => e.status !== "untested")) {
      const source = ran[ex.id];
      expect(source, `${ex.id} is labelled as run, so it needs a source file`).toBeDefined();
      expect(ex.content, `${ex.id} must be identical to ${source}`).toBe(read(source as string));
    }
    // Every example not backed by a real run says so.
    for (const ex of EXAMPLES.filter((e) => !(e.id in ran))) expect(ex.status).toBe("untested");
    expect(STATUS_LABEL.untested).toBe("Not run by us");
  });

  it("matches the starter the editor opens with, so the page and the editor teach the same shape", () => {
    const starter = frontMatter(starterTest("https://x.test/"));
    expect(starter?.keys).toEqual(["mode", "url", "max_steps"]);
    expect(frontMatter(MINIMAL.content)?.keys).toEqual(starter?.keys);
  });

  it("has distinct ids and names, and a rules list that does not claim more than was tested", () => {
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
    expect(RULES.length).toBeGreaterThan(4);
    expect(RULES.join(" ")).not.toMatch(/only (valid )?keys? (are|is) mode/i);
  });
});
