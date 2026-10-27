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
  --format <format>          Output format: pretty | json | md | sarif (repeatable).
                             sarif targets GitHub code-scanning upload. Default: pretty
  --out <file>               Write output to a file instead of stdout
  --baseline <file>          Compare against a prior JSON report and exit non-zero
                             only on new findings. The file must have been produced
                             by a prior octolens scan with --format json
  --severity <level>         Threshold: critical | high | medium | low | info. Default: high
  --verbose                  Enable debug logging on stderr
  --include-archived         Run rules against archived repositories (skipped by default).
                             Applies to --repo and --org --all-repos scans
  --fail-on-skip             Exit non-zero if any rule was skipped or errored (incomplete coverage)
  --only-rules <glob>        Only run rules whose ID matches the glob. Repeatable;
                             patterns are OR'd. Rule IDs use category/name format
                             (e.g. "security/*", "org/two-*")
  --skip-rules <glob>        Skip rules whose ID matches the glob. Repeatable;
                             patterns are OR'd. Applied after --only-rules narrowing
  --allow-public <repo>      Repo (owner/name) approved to be public. Repeatable
  --allow-internal <repo>    Repo (owner/name) approved to be internal. Repeatable
  -v, --version              Print version
  -h, --help                 Show this help

Configuration:
  Settings are read from $XDG_CONFIG_HOME/octolens/config.{json,jsonc,json5}
  (default under ~/.config), then ./octolens.config.{json,jsonc,json5} or an
  "octolens" key in ./package.json, merged in that order (the project source
  wins per key). Each location accepts at most one source; several at once is
  an error. Explicitly typed CLI flags override config values. See the README
  for the schema

Exit codes:
  0  no findings at threshold (or no new findings with --baseline), full coverage if --fail-on-skip
  1  findings at threshold (or new findings with --baseline), or incomplete under --fail-on-skip
  2  usage / configuration / authentication / baseline error
`;
