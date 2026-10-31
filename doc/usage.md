# Usage Guide

## Scanning every repository of an organization (`--all-repos`)

`--org my-org --all-repos` runs the org-posture rules **and** the full
repo rule set against every repository in the organization:

- The repository listing is streamed, so scanning starts immediately.
- Archived repositories are skipped by default (`--include-archived` to
  include them); skipped repos cost zero extra API requests.
- Repositories are scanned concurrently (`--concurrency <n>`, default 4,
  max 32).
- The scan **paces itself against the GitHub API rate limit**: it watches
  the remaining request budget on every response and, when the budget runs
  low, pauses until the rate window resets instead of failing. Large
  organizations complete — they just take longer (progress and pause ETAs
  are logged on stderr).
- A repository that fails to scan is recorded in the report and never
  aborts the rest of the run (`--fail-on-skip` turns any such gap into a
  non-zero exit).
- Output is an aggregate report (`target.type: "org-fleet"` in JSON);
  use `--out report.json` on large organizations.

## Gating CI on new findings (`--baseline`)

```bash
# Produce a baseline from a full scan
octolens scan --repo owner/name --format json --out baseline.json

# Gate: exit 1 only on findings not present in the baseline
octolens scan --repo owner/name --format json --baseline baseline.json
```

- A finding is "new" when no baseline finding shares its `ruleId`,
  subject, and title. Severity changes to a known finding are **not**
  treated as new.
- The baseline must be a JSON report of the same target (repo, org, or
  org-fleet). A `--severity` mismatch between the two runs is warned
  about, because the diff counts become misleading.
- `--baseline` exits 1 when any rule errored, even without
  `--fail-on-skip`: a scan that could not run cannot prove the absence
  of new findings. Skipped rules remain opt-in via `--fail-on-skip`.
- In baseline mode the output contains only the new findings. Do not
  point `--out` at the baseline file itself — octolens refuses that,
  because it would destroy the known findings and re-report them as new
  on the next run.
