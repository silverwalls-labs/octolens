# Checks Performed

## Repository checks (`--repo`)

Rules audit repository settings via the GitHub API — no repository content is
scanned. Grouped by category:

### `repo-config`

- `repo-config/branch-protection-required` – default branch must have a protection rule.
- `repo-config/block-force-push` – force pushes must be disabled on the default branch.
- `repo-config/require-pull-request` – pull requests must be required before merging.
- `repo-config/require-approving-reviews` – pull requests must require at least one approving review.
- `repo-config/dismiss-stale-reviews` – stale reviews must be dismissed on new commits.
- `repo-config/require-conversation-resolution` – conversation resolution must be required before merge.
- `repo-config/require-status-checks` – at least one required status check must be configured.
- `repo-config/require-linear-history` – linear history should be required on the default branch.
- `repo-config/require-signed-commits` – default branch should require signed commits.
- `repo-config/enforce-admins` – branch protection must apply to administrators.
- `repo-config/tag-protection` – tags must be protected by an active ruleset.
- `repo-config/environment-protection` – environments must have at least one protection rule.
- `repo-config/auto-delete-head-branches` – merged head branches should be deleted automatically.
- `repo-config/branch-count` – repository should not accumulate excessive branches.
- `repo-config/forbid-forking-private-repos` – private and internal repositories should not be forkable.
- `repo-config/license-file-present` – repository must have a detected license.
- `repo-config/description-present` – repository should have a description.
- `repo-config/topics-present` – repository should declare at least one topic.

### `access`

- `access/admin-count` – repository should not have an excessive number of admins.
- `access/team-based-admin` – at least one team should have admin access.
- `access/outside-collaborator-count` – repository should not have outside collaborators.
- `access/codeowners-file-present` – a CODEOWNERS file must be present.
- `access/codeowners-valid` – CODEOWNERS file must have no errors.
- `access/require-code-owner-reviews` – code owner reviews must be required when CODEOWNERS is present.
- `access/required-custom-properties` – all required organization custom properties must be set.
- `access/deploy-keys-readonly` – deploy keys should be read-only.
- `access/webhooks-use-https` – webhooks must use HTTPS with SSL verification.
- `access/visibility-private-default` – repositories should be private unless explicitly approved.

### `cicd`

- `cicd/actions-enabled` – GitHub Actions should be enabled.
- `cicd/actions-allowlist` – third-party actions should be restricted to an allowlist.
- `cicd/default-workflow-permissions-read` – default GITHUB_TOKEN permissions must be read-only.
- `cicd/forbid-workflow-pr-approval` – workflows must not be allowed to approve pull requests.
- `cicd/forbid-self-hosted-runners-on-public-repos` – public repositories must not use self-hosted runners.

### `security`

- `security/secret-scanning-enabled` – secret scanning must be enabled.
- `security/secret-scanning-push-protection` – secret-scanning push protection must be enabled.
- `security/code-scanning-enabled` – code scanning must be enabled.
- `security/dependabot-alerts-enabled` – Dependabot alerts must be enabled.
- `security/dependabot-security-updates-enabled` – Dependabot security updates must be enabled.
- `security/private-vulnerability-reporting` – public repositories must accept private vulnerability reports.
- `security/security-policy-file` – a SECURITY.md disclosure policy must be present.
- `security/scope-secrets-to-environments` – sensitive secrets should be scoped to environments, not the repository.
- `security/secrets-rotation` – long-lived secrets should be rotated at least every 90 days.

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
