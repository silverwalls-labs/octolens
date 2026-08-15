# Octolens

**Security & Configuration Auditing for GitHub Repositories**

OctoLens is a CLI tool that scans and analyzes GitHub repositories — individually, in bulk, or across entire organizations — to produce detailed reports on:

- **Security posture** – vulnerabilities, secret leaks, insecure configurations.
- **Configuration compliance** – repository settings, governance rules, industry standards.
- **Best practices** – branch protection, workflow safety, and repository hygiene.

Whether you’re running a compliance audit, reviewing security health, or ensuring consistent configuration across teams, OctoLens delivers clear, actionable insights.

## ✨ Features

- 🔍 **Full-Org Scanning** – Audit one, multiple, or all repositories in a GitHub organization.
- 📋 **Detailed Reports** – Export findings in human-readable or machine-consumable formats (JSON, Markdown, HTML).
- 🛡 **Security Checks** – Detect risky settings, missing protections, and potential vulnerabilities.
- ⚙ **Configuration Review** – Validate settings against good practices and compliance requirements.
- 🧭 **Customizable Rules** – Extend or override checks to match your own standards.

## 🚀 Installation

```bash
# Install globally via npm
npm install -g @silverwalls-labs/octolens

# Or run via npx
npx @silverwalls-labs/octolens <command>
```

## 🏃 Usage

```bash
# Audit a single repository
octolens scan --repo owner/name

# Audit an organization's own settings (2FA policy, member privileges,
# Actions policy, security defaults for new repositories)
octolens scan --org my-org

# Machine-readable output, stricter threshold
octolens scan --org my-org --format json --severity medium
```

`--repo` and `--org` are mutually exclusive. Organization checks need an
org **owner** token for full coverage — with a regular member token the
admin-only checks are reported as skipped, never as silent passes
(combine with `--fail-on-skip` to treat incomplete coverage as a failure).

## 🔧 Environment Variables

OctoLens requires a GitHub token and the target organization to run.

- **`ORGANISATION`** – The name of the GitHub organization to scan.
- **`GITHUB_TOKEN`** – A valid GitHub Personal Access Token (classic or fine-grained) with `repo` and `read:org` permissions.

**Example:**

```bash
export ORGANISATION=my-org
export GITHUB_TOKEN=ghp_yourtokenhere
```

## 🔍 Checks Performed

### Repository checks (`--repo`)

- Branch Protection Rules – required reviews, status checks, force push restrictions.
- Secret Detection – scan for keys, tokens, and sensitive strings.
- Workflow Security – GitHub Actions pinned versions and allowed actions list.
- Repo Settings – visibility, forking policy, issues enabled, wiki status.
- Dependency Health – dependabot enabled, outdated dependencies.
- License & Docs – presence of license, README, and contributing guidelines.

### Organization checks (`--org`)

Rules in the `org` category audit the organization's own settings:

- `org/two-factor-required` – 2FA must be required for all members.
- `org/default-repo-permission` – base repository permission must be read or none.
- `org/members-cannot-create-public-repos` – members must not create public repos.
- `org/members-cannot-fork-private-repos` – private repos must not be forkable.
- `org/members-cannot-change-repo-visibility` – repo admins must not flip visibility.
- `org/members-cannot-delete-repos` – repo admins must not delete or transfer repos.
- `org/members-cannot-invite-outside-collaborators` – invitations require an owner.
- `org/members-cannot-create-public-pages` – members must not publish public Pages sites.
- `org/members-cannot-delete-issues` – repo admins must not hard-delete issues.
- `org/web-commit-signoff-required` – web-UI commits must carry a DCO sign-off.
- `org/deploy-keys-disabled` – deploy keys should be disabled organization-wide.
- `org/dependabot-alerts-for-new-repos` – Dependabot alerts on by default.
- `org/dependabot-security-updates-for-new-repos` – security updates on by default.
- `org/secret-scanning-for-new-repos` – secret scanning on by default.
- `org/secret-scanning-push-protection-for-new-repos` – push protection on by default.
- `org/actions-allowlist` – marketplace actions must be restricted.
- `org/actions-allowlist-pinned` – allowlisted actions must pin a full commit SHA.
- `org/default-workflow-permissions-read` – org-wide GITHUB_TOKEN default must be read-only.
- `org/forbid-workflow-pr-approval` – workflows must not approve pull requests.
- `org/fork-pr-approval-all-contributors` – fork PR runs need approval for all externals.
- `org/limit-private-fork-pr-workflows` – no write tokens/secrets for private fork PR runs.
- `org/webhooks-use-https` – org webhooks must use HTTPS with SSL verification.

Scanning all repositories of an organization with the repository checks
(fan-out) is planned and will extend `--org` in a future release.

## 📂 Output Formats

- JSON – For automation and CI pipelines.
- Markdown – For reports and documentation.
- HTML – For compliance reviews.

## 🛠 Configuration

OctoLens can be customized with a `octolens.config.json` file in your project root or home directory.

**Example:**

```json
{
  "rules": {
    "branch_protection_required_reviews": true,
    "secret_scan_enabled": true,
    "license_required": true
  },
  "output": {
    "format": "markdown",
    "file": "./reports/audit.md"
  }
}
```
