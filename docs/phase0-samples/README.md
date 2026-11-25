# Phase 0 sanitized samples

These files are excerpts of **real** output from `kane-cli 0.10.9` (`testmd run <file> --agent --headless`, Windows, 2026-11-25). They are not synthetic.

Sanitization applied: the Windows user directory is replaced with `<HOME>`, the Test Manager `share_url` token is replaced with `<REDACTED>`, and long `context` objects are abridged to `"<abridged>"`. No other fields were changed. Raw captures stay in `docs/phase0-raw/` (gitignored) because they contain the account user name and local paths.

When these are used as parser test fixtures (Phase 3), the tests must label them `fixture` (testing-strategy.md). A fixture never satisfies `VERIFIED`.

| File | Source run | Process result |
|---|---|---|
| `pass-authoring.ndjson` | first run of `login_pass_test.md` (authored) | exit code not captured, see findings |
| `pass-replay.ndjson` | second run of the same file (replayed from cache) | exit 0 |
| `fail-authoring.ndjson` | `login_fail_test.md` | exit 1 |
