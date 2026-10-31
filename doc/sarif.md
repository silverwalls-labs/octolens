# SARIF Output — GitHub Code Scanning

`--format sarif` emits a [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
report that GitHub code scanning accepts, so findings appear as alerts
under **Security → Code scanning** (category `octolens/...`):

```yaml
permissions:
  contents: read
  security-events: write
  # required for private repositories
  actions: read

steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 24
  - name: Octolens scan
    run: >
      npx @silverwalls-labs/octolens scan --repo ${{ github.repository }}
      --format sarif --out octolens.sarif
    env:
      GITHUB_TOKEN: ${{ secrets.OCTOLENS_TOKEN }}
    # octolens exits 1 when it finds issues; the SARIF file is still written
    continue-on-error: true
  - name: Upload only complete scans
    # an incomplete scan (errored rules, failed repositories, or a
    # truncated fleet listing) would close every alert missing from it
    run: jq -e '.runs[0].invocations[0].executionSuccessful' octolens.sarif > /dev/null
  - uses: github/codeql-action/upload-sarif@v4
    with:
      sarif_file: octolens.sarif
```

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
