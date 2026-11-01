# Contributing — Testing

Tests run on Node's built-in test runner with native TypeScript
type-stripping — no transpiler in the loop, so coverage maps to true
source lines. Five categories live under `tests/`:

| Category | Command | What it covers | Coverage thresholds (L/B/F) |
| --- | --- | --- | --- |
| Unit | `npm run test:unit` | Every module in isolation (nock-mocked HTTP) | 100 / 98 / 100 |
| Integration | `npm run test:integration` | Full scan pipelines against mocked APIs | 90 / 85 / 90 |
| Smoke | `npm run test:smoke` | The CLI end to end, in process | 75 / 70 / 75 |
| Fuzz | `npm run test:fuzz` | Property-based invariants (fast-check) | reported only |
| E2E | `npm run test:e2e` | Real GitHub API + the built `bin/` | reported only |

Append `:cov` to a category script (e.g. `npm run test:unit:cov`) to
write `coverage/<category>.lcov` (and enforce thresholds where they
exist). `npm run coverage:report` then merges unit+integration+smoke+
fuzz into a global report and fails below 98% aggregate line coverage;
e2e coverage is shown as its own row but stays out of the merge. CI
runs each category as its own job and posts the table as a sticky PR
comment.

## E2E tests

Set `OCTOLENS_E2E_TOKEN` (falls back to `GITHUB_TOKEN` /
`OCTOLENS_TOKEN`) to a fine-grained read-only PAT; the suite skips
cleanly without it. The bin tests also need `npm run build` first.
In CI the token comes from the `OCTOLENS_E2E_TOKEN` repository secret.

## Fuzz tests

Runs are deterministic by default. Set `FUZZ_SEED` to
explore new inputs and `FUZZ_ITERS` (default 250) to change depth.
