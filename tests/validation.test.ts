import { describe, expect, it } from "vitest";
import {
  parseCriterionCreate,
  parseCriterionPatch,
  parseProjectCreate,
  parseProjectPatch,
  requireId,
} from "@/server/domain/validation";
import { validateTargetUrl } from "@/server/security/url";
import { validateTestFileSyntax } from "@/server/security/paths";
import { AppError } from "@/server/errors";

// Label: ProofLoop application test (not Kane verification).
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : "OTHER";
  }
  return "NO_ERROR";
};

describe("validateTargetUrl", () => {
  it("accepts http and https, including localhost", () => {
    expect(validateTargetUrl("https://www.saucedemo.com/")).toBe("https://www.saucedemo.com/");
    expect(validateTargetUrl(" http://localhost:4000 ")).toBe("http://localhost:4000/");
  });
  it.each([
    ["ftp://example.com"],
    ["javascript:alert(1)"],
    ["file:///etc/passwd"],
    ["https://user:pw@example.com"],
    ["example.com"],
    [""],
    ["   "],
  ])("rejects %s", (u) => {
    expect(code(() => validateTargetUrl(u))).toBe("VALIDATION_ERROR");
  });
  it("rejects non-strings", () => {
    expect(code(() => validateTargetUrl(42))).toBe("VALIDATION_ERROR");
  });
});

describe("validateTestFileSyntax", () => {
  it("accepts managed relative paths", () => {
    expect(validateTestFileSyntax("abc/login_test.md")).toBe("abc/login_test.md");
  });
  it.each([
    ["../login_test.md"],
    ["a/../b_test.md"],
    ["/abs/login_test.md"],
    ["C:/x/login_test.md"],
    ["a\\b_test.md"],
    ["a//b_test.md"],
    ["login.md"],
    ["_test.md"],
    ["a/b_test.md\0"],
    ["a/b:stream_test.md"],
  ])("rejects %j", (p) => {
    expect(code(() => validateTestFileSyntax(p))).toBe("VALIDATION_ERROR");
  });
});

describe("project validators", () => {
  it("trims, defaults notes to null, and rejects unknown fields", () => {
    expect(parseProjectCreate({ name: "  Demo ", targetUrl: "https://a.test" })).toEqual({
      name: "Demo",
      targetUrl: "https://a.test/",
      notes: null,
    });
    expect(code(() => parseProjectCreate({ name: "x", targetUrl: "https://a.test", extra: 1 }))).toBe("VALIDATION_ERROR");
  });
  it("enforces name length 1-80", () => {
    expect(code(() => parseProjectCreate({ name: "", targetUrl: "https://a.test" }))).toBe("VALIDATION_ERROR");
    expect(code(() => parseProjectCreate({ name: "x".repeat(81), targetUrl: "https://a.test" }))).toBe("VALIDATION_ERROR");
    expect(parseProjectCreate({ name: "x".repeat(80), targetUrl: "https://a.test" }).name).toHaveLength(80);
  });
  it("rejects empty patch and non-object bodies", () => {
    expect(code(() => parseProjectPatch({}))).toBe("VALIDATION_ERROR");
    expect(code(() => parseProjectPatch([]))).toBe("VALIDATION_ERROR");
    expect(code(() => parseProjectPatch(null))).toBe("VALIDATION_ERROR");
  });
  it("lets a patch clear notes", () => {
    expect(parseProjectPatch({ notes: null })).toEqual({ notes: null });
    expect(parseProjectPatch({ notes: "  " })).toEqual({ notes: null });
  });
});

describe("criterion validators", () => {
  const ok = { title: "T", expectedBehavior: "E", testFile: "p/a_test.md" };
  it("accepts the minimal body", () => {
    expect(parseCriterionCreate(ok)).toEqual({ title: "T", expectedBehavior: "E", notes: null, testFile: "p/a_test.md", stepLabel: null });
  });
  it("enforces title 1-120 and expected behavior 1-2000", () => {
    expect(code(() => parseCriterionCreate({ ...ok, title: "x".repeat(121) }))).toBe("VALIDATION_ERROR");
    expect(code(() => parseCriterionCreate({ ...ok, expectedBehavior: "x".repeat(2001) }))).toBe("VALIDATION_ERROR");
    expect(parseCriterionCreate({ ...ok, expectedBehavior: "x".repeat(2000) }).expectedBehavior).toHaveLength(2000);
    expect(code(() => parseCriterionCreate({ ...ok, title: " " }))).toBe("VALIDATION_ERROR");
  });
  it("rejects bad paths, unknown fields, and an empty patch", () => {
    expect(code(() => parseCriterionCreate({ ...ok, testFile: "../x_test.md" }))).toBe("VALIDATION_ERROR");
    expect(code(() => parseCriterionCreate({ ...ok, command: "rm" }))).toBe("VALIDATION_ERROR");
    expect(code(() => parseCriterionPatch({}))).toBe("VALIDATION_ERROR");
  });
});

describe("requireId", () => {
  it("returns NOT_FOUND for malformed ids", () => {
    expect(code(() => requireId("nope", "Project"))).toBe("NOT_FOUND");
    expect(requireId("7B4F1F53-7D5A-4F5D-86D8-789F4C2B7E10", "Project")).toBe("7b4f1f53-7d5a-4f5d-86d8-789f4c2b7e10");
  });
});
