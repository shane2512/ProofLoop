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
