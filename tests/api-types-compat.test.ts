import { describe, expect, it } from "vitest";
import type * as Client from "@/lib/api-types";
import type * as Server from "@/server/domain/types";
import type { EvidenceRefDto, RunDetailDto, RunSummaryDto } from "@/server/verification";
import type { KaneStreamSnapshot } from "@/server/kane/parser";
import type { TestFileEntry as ServerTestFileEntry } from "@/server/test-files";

// Label: ProofLoop application test. The assertions are compile-time: `npm run typecheck` fails if the
// client's hand-written API types drift from the server's. The runtime part only keeps vitest happy.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertTrue = <T extends true>(): T | undefined => undefined;

assertTrue<Equal<Client.Project, Server.Project>>();
assertTrue<Equal<Client.Criterion, Server.Criterion>>();
assertTrue<Equal<Client.CriterionStatus, Server.CriterionStatus>>();
assertTrue<Equal<Client.StatusNote, Server.StatusNote>>();
assertTrue<Equal<Client.RunStatus, Server.RunStatus>>();
assertTrue<Equal<Client.CriterionSnapshot, Server.CriterionSnapshot>>();
assertTrue<Equal<Client.RunSummary, RunSummaryDto>>();
assertTrue<Equal<Client.EvidenceRef, EvidenceRefDto>>();
assertTrue<Equal<Client.RunEvent, RunDetailDto["events"][number]>>();
assertTrue<Equal<Client.TestFileEntry, ServerTestFileEntry>>();
// The server types `kane` as unknown (it stores the parser snapshot as JSON). The client's shape must match the parser's.
assertTrue<Equal<Client.KaneSnapshot, KaneStreamSnapshot>>();

describe("client API types", () => {
  it("match the server types (checked by the compiler)", () => {
    expect(true).toBe(true);
  });
});
