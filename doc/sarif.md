# SARIF Output — GitHub Code Scanning

`--format sarif` emits a [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
report that GitHub code scanning accepts, so findings appear as alerts
under **Security → Code scanning** (category `octolens/...`):

```yaml
name: Octolens audit

on:
  push:
    branches: [ main ]
  schedule:
    - cron: '0 6 * * 1'

permissions:
  contents: read
  security-events: write
  # required for private repositories
  actions: read

jobs:
  octolens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
      - name: Octolens scan
        run: >
          npx --yes @silverwalls-labs/octolens scan --repo ${{ github.repository }}
          --format sarif --out octolens.sarif
        env:
          GITHUB_TOKEN: ${{ secrets.OCTOLENS_TOKEN }}
        # octolens exits 1 when it finds issues; the SARIF file is still written
        continue-on-error: true
      - name: Upload only complete scans
        # an incomplete scan (errored rules, failed repositories, or a
        # truncated fleet listing) would close every alert missing from it
        run: jq -e '.runs[0].invocations[0].executionSuccessful' octolens.sarif > /dev/null
      - uses: github/codeql-action/upload-sarif@9b3254085494b55a0f7c4c2b3d2d52cc712ce370 # v4
        with:
          sarif_file: octolens.sarif
```

The example pins the third-party actions to full commit SHAs; pin the
octolens package the same way (e.g. `npx --yes
@silverwalls-labs/octolens@<version>`) once it is published, so audit
behavior cannot change between runs.

## Notes

- The workflow's default `GITHUB_TOKEN` lacks the admin-read scopes many
  rules need — those rules are reported as skipped. Use a PAT (stored as
  a secret) for full coverage. Skipped rules do not fail the upload
  guard; only errored rules, failed repositories, or a truncated fleet
  listing do.
- Octolens findings describe repository/organization *settings*, not
  files, so alerts point at a representative file (`.github/CODEOWNERS`,
  `SECURITY.md`, `LICENSE`, or `README.md` as fallback) — which may not
  exist in the repository; the alert is still created and tracked.
- A fleet report (`--org X --all-repos`) flattens every repository's
  findings into one run, with each alert message prefixed by
  `owner/name`. Upload it to a dedicated audit repository rather than a
  regular code repository.
- GitHub rejects SARIF uploads over 10 MB (gzip-compressed) or 25,000
  results per run, and displays only the top 5,000 results per run,
  prioritized by severity. Large fleet reports should raise
  `--severity` to stay within the limits.
- Repositories excluded by fleet filters (archived, fork, or on the
  ignore list) contribute no results, so alerts previously uploaded for
  them are closed on the next upload.
