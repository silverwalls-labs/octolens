# Next

Tracking everything we explicitly chose **not** to ship in v1, plus known
sharp edges in the rules that did ship. Nothing here blocks `1.0.0` — it's a
holding pen for follow-up minor releases.

## Deferred from the original `new-major` scope

- **SARIF output + GitHub code-scanning upload** — `--format sarif` and the
  glue to attach the report to a workflow run.
- **Markdown output format** — `--format md` for GitHub job summaries / PR
  comments. JSON and pretty are the only formats wired right now.
- **`cosmiconfig` config discovery** — `octolens.config.{ts,js,json,yaml}` +
  `package.json#octolens`, with severity overrides and ignore lists. Today
  rules use their built-in defaults.
- **`--org <org>` repo fan-out** — running the per-repo rules across every
  repository of an org. Engine already scans one repo at a time; needs an
  org walker, `--concurrency`, and `ignore.archived` / `ignore.forks`
  plumbing. (`--org` itself shipped with the org-posture rules — see below —
  so fan-out is now an extension of the existing flag, not a new one.)
- **GitHub App auth path** — `--app-id` + `--app-private-key`, plus OIDC
  inside Actions. Today only PAT (`--token`, `GITHUB_TOKEN`, `gh auth token`)
  works.
- **`list-rules` / `init` / `explain` CLI subcommands** — discoverability and
  config bootstrapping. Single `scan` command for now.
- **Custom user-authored rule packs** — loading rules from external npm
  packages. Today the rule registry is closed.
- **GitLab / Bitbucket / Gitea support** — GitHub-only.
- **HTML reports, dashboards, scoring/grading** — pretty/json only.
- **Auto-remediation** — opening PRs to fix findings. We report, we don't
  edit.

## Rule follow-ups

### New rules worth adding

These came up while building the v1 rule set and were deliberately deferred:

- **`cicd/pin-actions-by-sha`** — flag workflows that reference third-party
  actions by tag/branch instead of full commit SHA. Requires walking
  `.github/workflows/*.yml` and parsing each step's `uses:`. Bigger lift than
  the API-only rules already shipped.
- **`security/per-environment-secrets`** — extend `scope-secrets-to-environments`
  to verify *each* environment defines the secrets its workflows reference.
  Requires cross-referencing workflow YAML against environment secret lists.

### Org-level rules — SHIPPED (supersedes the old "out of scope" call)

An earlier version of this note declared org-posture checks out of scope.
That decision was reversed (issue #6): Octolens now ships a 12-rule `org`
category behind `scan --org <org>` — 2FA enforcement, base repo permission,
member repo-creation/forking privileges, security defaults for new repos,
org-level Actions policy, and org webhooks. Org rules have their own
`OrgRule`/`OrgRuleContext` contract and `scanOrg` engine path; findings
carry `org` instead of `repo`. Non-owner tokens make the admin-gated rules
`skip(...)` (visible coverage gap, never a silent pass).

Org follow-ups deliberately deferred:

- **`org/secure-two-factor-methods-required`** — the "Only allow secure
  two-factor methods" setting (disallows SMS 2FA) is not exposed by any
  API today: `GET /orgs/{org}` only returns `two_factor_requirement_enabled`
  and GraphQL only `requiresTwoFactorAuthentication` (verified live
  2026-08-15). Add the rule as soon as GitHub exposes the field.
- **`org/security-managers-assigned`** — the REST endpoint
  (`orgs.listSecurityManagerTeams`) was removed by GitHub in January 2026;
  needs the organization-roles API instead.
- **Runner groups allowing public repos** — `GET
  /orgs/{org}/actions/runner-groups` is plan-gated (Team/Enterprise) and
  paginated; skipped for v1 of the org rules.
- **Migrate the four `*-for-new-repos` rules** off the deprecated
  `GET /orgs/{org}` fields (`*_enabled_for_new_repositories`, "closing
  down" upstream) to `codeSecurity.getDefaultConfigurations`. Until then,
  if GitHub removes the fields the rules degrade to visible skips.
- **Archived-org gate** — orgs expose `archived_at`; `scanOrg` currently
  has no equivalent of the repo archived skip.
- **Org webhook query symmetry** — `getOrgWebhooks` wraps results in
  `checked` from day one; the repo-level `getRepoWebhooks` still returns
  `[]` on a permission 403 (a pass, not a skip) and is worth aligning.

### Sharp edges in shipped rules

- **`access/required-custom-properties`** — silently no-ops on user repos
  (the org-properties endpoint returns 404). Acceptable since the rule only
  fires when an org has defined required properties, but worth a note in the
  rule docs once those exist.
- **`repo-config/tag-protection`** — only checks the rulesets endpoint. The
  legacy `/repos/{owner}/{repo}/tags/protection` endpoint (deprecated by
  GitHub but still active for older repos) is not consulted, so a repo
  protected only via the legacy mechanism will be flagged.
- **Hardcoded thresholds** — `admin-count` (>3 admins), `branch-count` (>100
  branches), `outside-collaborator-count` (>0), `secrets-rotation` (90 days)
  all use baked-in numbers. Per-rule numeric config (`{ maxAdmins: 5 }`) is
  blocked on cosmiconfig landing.
- **`security/secrets-rotation`** — only flags Actions/Dependabot/Codespaces
  *repo*-level secrets. Environment-scoped secrets are not inspected and may
  silently outlive the 90-day window.
- **`access/team-based-admin`** — `info`-severity reminder. On a
  personal-account repo `/repos/.../teams` returns `200 []` (not 404, as an
  earlier note claimed), so the rule *fires* on user repos rather than
  no-op'ing. Worth a config knob to disable globally for personal-account
  scans, or detecting user-owned repos and skipping.
- **`cicd/forbid-self-hosted-runners-on-public-repos`** — skips on private
  repos by design. If the user runs untrusted PRs on self-hosted runners in
  a *private* repo, that's a real risk we don't catch.
- **`access/visibility-private-default`** — allowlists are CLI-only
  (`--allow-public` / `--allow-internal`, repeatable, exact `owner/name`
  match). No globs, no config file. When cosmiconfig lands, both lists
  should move into the rule's per-rule `config` slot with glob support; the
  CLI flags become overrides.

## Bug: throttling can masquerade as a clean result — FIXED

**Was: high severity — a false-negative under load, the worst failure mode
for a security scanner.** The core conflation and both coverage-visibility
follow-ups are fixed (items 1–3 below). Two low-priority hardening items
remain (4–5): self-pacing the request burst, and a cosmetic skip-vs-error
consistency pass on the remaining fetchers.

### What happened

Every fetcher in `src/github/queries.ts` wraps its call in a `try/catch`
that treats certain statuses as "no permission → return empty / not-checked".
The swallow used to include a bare `403`:

```ts
} catch (err) {
  if (isHttpStatus(err, 404) || isHttpStatus(err, 403)) {  // <- the bug
    return { checked: false, ... };
  }
  throw err;
}
```

That branch exists for **narrow-scope tokens** (a fine-grained PAT that
genuinely can't read teams/runners/secrets should degrade gracefully, not
crash the scan). The problem: a `403` returned because of **secondary rate
limiting** was indistinguishable, at the catch site, from a real
permission-denied `403`. Both silently became zero findings while the scan
still exited `0`.

Note: `401` was **not** part of this bug — the catch only ever swallowed
404/403, so a 401 already re-throws and surfaces as a `RuleRun` error. (An
earlier draft of this note wrongly implicated 401.)

### The fix (done)

`src/github/queries.ts` now distinguishes the two kinds of 403:

- `isRateLimited(err)` — true for `429`, or a `403` carrying rate-limit
  signals: `x-ratelimit-remaining: 0`, a `retry-after` header, or a message
  body mentioning "rate limit" / "secondary rate" / "abuse".
- `isForbiddenNotRateLimited(err)` — `403 && !isRateLimited` — the only 403
  the fetchers swallow now.

All 12 swallow sites were switched from `isHttpStatus(err, 403)` to
`isForbiddenNotRateLimited(err)`. A throttle 403/429 therefore propagates
out of the fetcher → `runRule` catches it → the rule shows as `❌ error` in
output instead of a silent clean pass. The `@octokit/plugin-retry` +
`plugin-throttling` backoff still runs *inside* Octokit first, so we only
see the error after retries are exhausted. Covered by
`tests/github/rate-limit.test.ts` (permission-403 swallowed; header-403,
message-403, and 429 all propagate).

### How it was found

8→7 finding-count drift between two live scans of `sheplu/editorconfig`.
First (wrong) guess blamed `team-based-admin` flickering on a teams-endpoint
404. Actual cause: a transient throttle on `GET /collaborators` swallowed as
"no permission". The teams endpoint is stable (`200 []`); the instability was
secondary rate limiting on the shared token, partly self-inflicted by rapid
probing during debugging. The new Checks table / coverage footer make such
errored rules visible, which is how the fix was verified.

### Follow-ups

1. ~~Stop conflating throttle with permission-denied.~~ **Done** (above).
2. ~~Make "not checked" visible.~~ **Done.** `RuleSkipped` + `skip(reason)`
   (`src/types/skip.ts`); `runRule` records `status: 'skipped'` with a
   `skipReason`, distinct from `ok`/`error`. The 6 rules whose `!checked`
   meant a genuine coverage gap now `skip(...)`. "Not applicable" paths
   (`meta.private` on public-only rules, CODEOWNERS-absent 404) deliberately
   still return `[]` (an honest pass) so private-repo scans don't report
   phantom skips.
3. ~~`--fail-on-skip` / strict mode.~~ **Done.** `exitCodeFor(result,
   { failOnIncomplete })` returns 1 if any rule skipped *or* errored; wired
   to the `--fail-on-skip` CLI flag.
4. **Throttle our own burst** — the cached fetcher dedupes but does not pace.
   A small per-scan concurrency cap would reduce how often we trip the
   secondary limit at all. Lower priority now that throttles surface loudly.
5. **Some permission-denied fetchers error instead of skip (consistency).**
   The `skip` conversion only covered fetchers that already had a 403-swallow
   branch. Fetchers *without* one — observed live on `octocat/Hello-World`:
   `security/code-scanning-enabled`, `cicd/actions-enabled`,
   `cicd/default-workflow-permissions-read`, `cicd/forbid-workflow-pr-approval`,
   `cicd/actions-allowlist` — let a permission 403 throw raw, so they show as
   `❌ error` rather than `⏭️ skipped`. Both are caught by `--fail-on-skip`
   (it fails on errored too), so this is **cosmetic/UX, not a correctness
   gap**: a permission wall reads as an error instead of a clean skip. Fix:
   give those fetchers the same `isForbiddenNotRateLimited` branch returning a
   `checked: false`-style result, and have the rule `skip(...)`. Note
   `default-workflow-permissions` currently has no try/catch at all, so it
   throws on any non-200.

### `ruleConfig` bag pattern

`RuleContext.ruleConfig: Record<string, unknown>` is the per-rule config
channel. Today only `access/visibility-private-default` uses it, threaded
from `--allow-public` / `--allow-internal` in `src/cli/main.ts`. Each rule
that wants per-rule settings reads its own slice with a typed accessor and
no shared schema registry. When cosmiconfig lands, the file-loaded config
populates the same bag and the rule code does not change.

## Verification checklist (still open)

From the original plan §13 — items not yet exercised:

- `--format md --out report.md` rendering inside a GitHub job summary.
- All four auth paths against a live test repo (PAT env, `--token`,
  `gh auth token`, GitHub App).
- `npm pack` tarball consumed from a sibling project — verify `dist/`,
  `bin/`, types, and `exports` resolve correctly.
- `npx . scan --org <org>` wall-clock budget against a small org.
