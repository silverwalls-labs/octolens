# Checks Performed

## Repository checks (`--repo`)

- Branch Protection Rules – required reviews, status checks, force push restrictions.
- Secret Detection – scan for keys, tokens, and sensitive strings.
- Workflow Security – GitHub Actions pinned versions and allowed actions list.
- Repo Settings – visibility, forking policy, issues enabled, wiki status.
- Dependency Health – dependabot enabled, outdated dependencies.
- License & Docs – presence of license, README, and contributing guidelines.

## Organization checks (`--org`)

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
