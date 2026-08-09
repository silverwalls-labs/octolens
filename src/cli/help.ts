export const HELP_TEXT = `Usage:
  octolens scan --repo <owner/name> [options]

Options:
  --repo <owner/name>        Target repository (required)
  --token <value>            GitHub token. Falls back to $GITHUB_TOKEN, then \`gh auth token\`
  --format <pretty|json|md>  Output format (repeatable). Default: pretty
  --out <file>               Write output to a file instead of stdout
  --severity <level>         Threshold: critical | high | medium | low | info. Default: high
  --verbose                  Enable debug logging on stderr
  --include-archived         Run rules against archived repositories (skipped by default)
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
