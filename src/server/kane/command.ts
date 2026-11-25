import "server-only";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "../errors";

/** The only CLI version the adapter was validated against (docs/phase0-findings.md). */
export const SUPPORTED_KANE_VERSION = "0.10.9";

export interface KaneLaunch {
  executable: string;
  /** Arguments placed before the fixed testmd arguments (for example the .cjs entry on Windows). */
  prefixArgs: string[];
}

/**
 * Locates the Kane CLI without a shell (PROC-001).
 *
 * - `KANE_CLI_PATH` ending in .js/.cjs/.mjs runs under the current Node binary.
 * - `KANE_CLI_PATH` ending in .cmd/.bat is rejected: Node cannot spawn them without a shell.
 * - Any other `KANE_CLI_PATH` is spawned directly.
 * - Without it on Windows, the global npm package entry under %APPDATA% is used.
 * - Without it elsewhere, `kane-cli` is resolved from PATH by the OS.
 *
 * Returns null when nothing usable is found.
 */
export function resolveKaneLaunch(
  configuredPath: string | null,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): KaneLaunch | null {
  if (configuredPath !== null) {
    const ext = path.extname(configuredPath).toLowerCase();
    if (ext === ".cmd" || ext === ".bat") {
      throw new AppError("PREREQUISITE_FAILED", "KANE_CLI_PATH must not be a .cmd or .bat file. Point it at the package's bin/kane-cli.cjs.", 424);
    }
    if (!path.isAbsolute(configuredPath) || !fs.existsSync(configuredPath)) return null;
    if (ext === ".js" || ext === ".cjs" || ext === ".mjs") return { executable: process.execPath, prefixArgs: [configuredPath] };
    return { executable: configuredPath, prefixArgs: [] };
  }
  if (platform === "win32") {
    const appData = env.APPDATA;
    if (!appData) return null;
    const entry = path.join(appData, "npm", "node_modules", "@testmuai", "kane-cli", "bin", "kane-cli.cjs");
    return fs.existsSync(entry) ? { executable: process.execPath, prefixArgs: [entry] } : null;
  }
  return { executable: "kane-cli", prefixArgs: [] };
}

export interface KaneCommand {
  executable: string;
  args: string[];
}

/**
 * Builds the single validated command: `testmd run <file> --agent --headless`.
 * Nothing else can be added. `testFileAbs` must already be resolved by `resolveManagedTestPath`.
 */
export function buildKaneRunCommand(launch: KaneLaunch, testFileAbs: string): KaneCommand {
  if (!path.isAbsolute(testFileAbs) || !testFileAbs.endsWith("_test.md")) {
    throw new AppError("TEST_MAPPING_INVALID", "Test file must be an absolute path ending in _test.md.", 422);
  }
  const stat = fs.statSync(testFileAbs, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) {
    throw new AppError("TEST_MAPPING_INVALID", "Test file does not exist.", 422);
  }
  return {
    executable: launch.executable,
    args: [...launch.prefixArgs, "testmd", "run", testFileAbs, "--agent", "--headless"],
  };
}

/** Builds the `--version` command used by preflight. */
export function buildKaneVersionCommand(launch: KaneLaunch): KaneCommand {
  return { executable: launch.executable, args: [...launch.prefixArgs, "--version"] };
}
