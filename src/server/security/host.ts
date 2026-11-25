/**
 * Loopback Host check (SEC-001). ProofLoop only ever answers requests addressed to a loopback name.
 * Without this, a web page on another site could point a hostname it controls at 127.0.0.1 ("DNS
 * rebinding") and then read this app's data as if it were same-origin. The Host header cannot be set by a
 * web page, so requiring a loopback value closes that route. The port is not checked: the user may run
 * ProofLoop on any port.
 */
const LOOPBACK_NAMES = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isLoopbackHostHeader(host: string | null): boolean {
  if (host === null || host === "" || host.length > 255) return false;
  let name = host.trim().toLowerCase();
  if (name.startsWith("[")) {
    const end = name.indexOf("]");
    if (end < 0) return false;
    const rest = name.slice(end + 1);
    if (rest !== "" && !/^:\d{1,5}$/.test(rest)) return false;
    name = name.slice(0, end + 1);
  } else {
    const colon = name.lastIndexOf(":");
    if (colon >= 0) {
      if (!/^\d{1,5}$/.test(name.slice(colon + 1))) return false;
      name = name.slice(0, colon);
    }
  }
  return LOOPBACK_NAMES.has(name);
}
