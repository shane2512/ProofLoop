import { describe, expect, it } from "vitest";
import { isLoopbackHostHeader } from "@/server/security/host";

// Label: ProofLoop application test (SEC-001, DNS-rebinding guard).
describe("isLoopbackHostHeader", () => {
  it.each(["127.0.0.1", "127.0.0.1:3000", "localhost", "localhost:3100", "LOCALHOST:3000", "[::1]", "[::1]:3000", "127.0.0.1:65535"])("accepts %s", (h) => {
    expect(isLoopbackHostHeader(h)).toBe(true);
  });

  it.each([
    null,
    "",
    "evil.example",
    "evil.example:3000",
    "127.0.0.1.evil.example",
    "127.0.0.1.evil.example:3000",
    "localhost.evil.example",
    "evil.example/127.0.0.1",
    "0.0.0.0:3000",
    "192.168.1.20:3000",
    "127.0.0.2",
    "[::1",
    "[::1]x",
    "127.0.0.1:abc",
    "127.0.0.1:",
    "user@127.0.0.1",
    "x".repeat(300),
  ])("rejects %j", (h) => {
    expect(isLoopbackHostHeader(h)).toBe(false);
  });
});
