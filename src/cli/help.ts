/** Full CLI help/usage text printed by `--help` and on usage errors. */
export const HELP_TEXT = `Usage:
  octolens scan --repo <owner/name> [options]
  octolens scan --org <organization> [options]
  octolens scan --org <organization> --all-repos [options]

Options:
  --repo <owner/name>        Target repository. Exactly one of --repo / --org is required
  --org <organization>       Audit the organization's own settings (2FA policy, member
                             privileges, Actions policy, security defaults for new repos).
                             Full visibility requires an org owner token; other tokens
                             skip the checks they cannot see
  --all-repos                With --org: also scan every repository of the organization.
                             Repositories are scanned concurrently and paced against the
                             API rate limit — on large organizations the scan pauses until
                             the rate window resets instead of failing. Progress is logged
                             on stderr; use --out for the report on large organizations
  --concurrency <n>          With --all-repos: repositories scanned in parallel (1-32).
                             Default: 4
  --token <value>            GitHub token. Falls back to $GITHUB_TOKEN, then \`gh auth token\`
  --format <pretty|json|md>  Output format (repeatable). Default: pretty
  --out <file>               Write output to a file instead of stdout
  --severity <level>         Threshold: critical | high | medium | low | info. Default: high
  --verbose                  Enable debug logging on stderr
  --include-archived         Run rules against archived repositories (skipped by default).
                             Applies to --repo and --org --all-repos scans
  --fail-on-skip             Exit non-zero if any rule was skipped or errored (incomplete coverage)
  --allow-public <repo>      Repo (owner/name) approved to be public. Repeatable
  --allow-internal <repo>    Repo (owner/name) approved to be internal. Repeatable
  -v, --version              Print version
  -h, --help                 Show this help

Exit codes:
  0  no findings at or above the threshold (and, with --fail-on-skip, full coverage)
  1  findings at or above the threshold, or incomplete coverage under --fail-on-skip
  2  usage / configuration / authentication error
`;
