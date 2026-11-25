import os from "node:os";

export type Redactor = (text: string) => string;

export interface RedactorOptions {
  /** Exact secret values to remove (SEC-004). Values shorter than 4 characters are ignored. */
  secrets?: readonly string[];
  /** Home directories to replace with <HOME>. Defaults to the current user's home. */
  homeDirs?: readonly string[];
}

const REDACTED = "[REDACTED]";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a function that removes known secrets, local home paths, Test Manager share tokens,
 * bearer tokens and credential flags from text. It is applied to every line of Kane output and to
 * the displayed command before anything is stored, returned or exported.
 */
export function createRedactor(options: RedactorOptions = {}): Redactor {
  const secrets = [...new Set((options.secrets ?? []).filter((s) => s.length >= 4))].sort((a, b) => b.length - a.length);
  const secretRes = secrets.map((s) => new RegExp(escapeRegExp(s), "g"));

  const homes = (options.homeDirs ?? [os.homedir()]).filter((h) => h.length > 3);
  const variants = new Set<string>();
  for (const h of homes) {
    variants.add(h);
    variants.add(h.replace(/\\/g, "/")); // forward-slash form
    variants.add(h.replace(/\\/g, "\\\\")); // JSON-escaped form seen inside NDJSON strings
    variants.add(h.replace(/\\/g, "\\\\\\\\")); // escaped twice, as in JSON nested inside a JSON string
  }
  const sorted = [...variants].sort((a, b) => b.length - a.length);
  const homeRe =
    sorted.length > 0 ? new RegExp(sorted.map(escapeRegExp).join("|"), process.platform === "win32" ? "gi" : "g") : null;

  const shareRe = /(\/share\/)[A-Za-z0-9_-]{16,}/g;
  const bearerRe = /(Bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi;
  const flagRe = /(--(?:access-key|password|token)(?:=|\s+))\S+/gi;
  // Account identifiers in Test Manager links and summaries. They are not credentials, but they tie text to one account.
  const managerUrlRe = /(test-manager\.[A-Za-z0-9.-]+\/projects\/)[A-Za-z0-9_-]+(\/test-cases\/)[A-Za-z0-9_-]+/g;
  const testcaseRe = /(testcase_id\\*"\s*:\s*\\*")[A-Za-z0-9_-]+/g;

  return (text: string): string => {
    let out = text;
    for (const re of secretRes) out = out.replace(re, REDACTED);
    if (homeRe) out = out.replace(homeRe, "<HOME>");
    return out
      .replace(shareRe, "$1<REDACTED>")
      .replace(bearerRe, `$1${REDACTED}`)
      .replace(flagRe, `$1${REDACTED}`)
      .replace(managerUrlRe, "$1<ID>$2<ID>")
      .replace(testcaseRe, "$1<ID>");
  };
}
