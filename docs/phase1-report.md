# Phase 1 Report: Architecture and Project Setup

Status: **PASS** (re-verified after fixes, see "Re-verification").

## Environment (as reported by the owner, Windows Command Prompt)

| Item | Version |
|---|---|
| Node.js | v26.12.1 |
| npm | 11.11.0 |
| git | 2.47.1.windows.1 |
| kane-cli | 0.10.9 (installed; **not validated**, Phase 0 skipped) |
| Next.js | 16.4.6 (Turbopack) |
| React / React DOM | ^19.3.1 |
| TypeScript | ^6.0.3 |
| Vitest | 5.1.2 |

Exact resolved versions are in `package-lock.json`. Chrome version and OS build were not recorded.

## Results observed (owner-run, before the fixes below)

| Check | Result |
|---|---|
| `npm ci` | passed, 151 packages, 0 vulnerabilities |
| `npm run lint` | passed, no output |
| `npm run typecheck` | passed, no output |
| `npm test` | passed, 6 of 6 (ProofLoop application tests, not Kane verification) |
| `npm run build` | passed; routes `/` (dynamic), `/_not-found`, `/api/v1/health` (dynamic) |
| `npm start` | ready on `http://127.0.0.1:3000` |
| `GET /api/v1/health` | 200 `{"status":"ok","storage":"not_initialized"}` |
| `netstat` | LISTENING on `127.0.0.1:3000` only |
| `git add -n .` | no `node_modules`, `.next`, `data`, `.env`, or lockfile-excluded files listed |

## Fixes applied after review

1. Next.js ignored the lockfile because a stray `package-lock.json` exists in the user's home directory. `next.config.ts` now sets `turbopack.root` and `outputFileTracingRoot` to the project root.
2. Vitest warned about ESM syntax in a CommonJS-loaded config. Renamed to `vitest.config.mts`.
3. `engines.node` changed from `>=20.9.0` to `>=26.12.1 <27` and `.nvmrc` added, because only 26.12.1 was tested (TR-001).

## Re-verification (run by the agent after the fixes)

| Check | Result |
|---|---|
| `npm run lint` | passed, no output |
| `npm run typecheck` | passed, no output |
| `npm test` | 6 of 6 passed, Vitest config warning gone |
| `npm run build` | passed, Next.js root/lockfile warnings gone |
| `GET /` | 200, HTML contains the local-only banner and "application skeleton is running" |
| `GET /api/v1/health` | 200 `{"status":"ok","storage":"not_initialized"}` |
| Listener | `127.0.0.1:3000` only (served by the owner's already-running server, PID 5372; the agent's own `npm start` failed with EADDRINUSE, so the final build was served by that process) |

Not tested: the error boundary rendering, and `npm ci` after the fixes (dependencies unchanged).

## Requirement IDs

TR-001 (versions pinned, partly: Chrome not recorded), TR-002 (`server-only` on server modules), TR-003 (Node runtime set on routes, no static export), TR-004 (module folders), SEC-001 (loopback scripts and config check), SEC-005 (no `NEXT_PUBLIC_` variables).

## Known limitations and deviations

- Phase 0 was skipped at the owner's request. Kane command behavior, exit codes, and evidence locations are unvalidated.
- `/api/v1/health` returns `storage: "not_initialized"` instead of `"ready"` (api-spec.md) because no storage exists yet. Resolve in Phase 2.
- `config.ts` is exercised by unit tests only. The home page calls `loadConfig()`, so an invalid `.env` shows the error boundary, which has not been tested.
- The `dev` script binds loopback through CLI flags, while `PROOFLOOP_HOST` and `PROOFLOOP_PORT` are validated but do not change the scripts. The values must be kept in sync by hand.
- No Kane execution, database, or CRUD exists.
