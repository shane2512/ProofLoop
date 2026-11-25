import { describe, expect, it } from "vitest";
import { createRedactor } from "@/server/security/redact";

// Label: ProofLoop application test.
describe("createRedactor", () => {
  const home = "C:\\Users\\alice";
  const r = createRedactor({ secrets: ["hunter2-secret", "ab"], homeDirs: [home] });

  it("removes exact secret values and ignores very short ones", () => {
    expect(r("key=hunter2-secret end")).toBe("key=[REDACTED] end");
    expect(r("about")).toBe("about");
  });

  it("replaces the home directory in plain, forward-slash and JSON-escaped forms", () => {
    expect(r("C:\\Users\\alice\\AppData")).toBe("<HOME>\\AppData");
    expect(r("C:/Users/alice/x")).toBe("<HOME>/x");
    expect(r('"C:\\\\Users\\\\alice/.testmuai"')).toBe('"<HOME>/.testmuai"');
    expect(r("C:\\\\\\\\Users\\\\\\\\alice\\\\\\\\x")).toBe("<HOME>\\\\\\\\x"); // escaped twice
  });

  it("removes share tokens, bearer tokens and credential flags", () => {
    expect(r("https://x.example/dashboard/share/US_EXAMPLE0TOKEN0FOR0TESTS0ONLY1234?type=summary")).toContain("/share/<REDACTED>?type=summary");
    expect(r("Authorization: Bearer abcdefghijklmnop.qrstu")).toBe("Authorization: Bearer [REDACTED]");
    expect(r("kane-cli run --access-key sk-live-123 --username bob")).toBe("kane-cli run --access-key [REDACTED] --username bob");
    expect(r("--password=pw123456")).toBe("--password=[REDACTED]");
  });

  it("leaves ordinary text unchanged", () => {
    expect(r("Verify the page shows the Products heading")).toBe("Verify the page shows the Products heading");
  });

  it("treats regex metacharacters in secrets literally", () => {
    const m = createRedactor({ secrets: ["a.b*c+(d)"], homeDirs: [] });
    expect(m("x a.b*c+(d) y aXbbc+(d)")).toBe("x [REDACTED] y aXbbc+(d)");
  });
});

describe("createRedactor: Test Manager account identifiers", () => {
  const r = createRedactor({ homeDirs: [] });
  it("hides project and test-case ids in links, and the test case id in summaries", () => {
    const line = '{"share_url":"https://test-manager.lambdatest.com/projects/01M89DAAAQCYB8FCWAQC6X3355/test-cases/01M89Z4KZV40G2XW0KQ5CG3YMA/dashboard/share/abcdefghijklmnop1234?type=summary","commit":{"testcase_id":"01M89Z4KZV40G2XW0KQ5CG3YMA"}}';
    const out = r(line);
    expect(out).not.toContain("01M89");
    expect(out).toContain("test-manager.lambdatest.com/projects/<ID>/test-cases/<ID>/dashboard/share/<REDACTED>");
    expect(out).toContain('"testcase_id":"<ID>"');
  });
  it("also works when the JSON is escaped inside a string", () => {
    expect(r('x \\"testcase_id\\":\\"01M89Z4KZV\\" y')).not.toContain("01M89Z4KZV");
  });
  it("leaves ordinary text alone", () => {
    expect(r("projects/foo and test-cases/bar")).toBe("projects/foo and test-cases/bar");
  });
});
