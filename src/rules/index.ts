import { rule as adminCount } from './access/admin-count.ts';
import { rule as codeownersFilePresent } from './access/codeowners-file-present.ts';
import { rule as codeownersValid } from './access/codeowners-valid.ts';
import { rule as deployKeysReadonly } from './access/deploy-keys-readonly.ts';
import { rule as outsideCollaboratorCount } from './access/outside-collaborator-count.ts';
import { rule as requireCodeOwnerReviews } from './access/require-code-owner-reviews.ts';
import { rule as requiredCustomProperties } from './access/required-custom-properties.ts';
import { rule as teamBasedAdmin } from './access/team-based-admin.ts';
import { rule as visibilityPrivateDefault } from './access/visibility-private-default.ts';
import { rule as webhooksUseHttps } from './access/webhooks-use-https.ts';
import { rule as actionsAllowlist } from './cicd/actions-allowlist.ts';
import { rule as actionsEnabled } from './cicd/actions-enabled.ts';
import {
	rule as defaultWorkflowPermissionsRead,
} from './cicd/default-workflow-permissions-read.ts';
import {
	rule as forbidSelfHostedRunnersOnPublicRepos,
} from './cicd/forbid-self-hosted-runners-on-public-repos.ts';
import { rule as forbidWorkflowPrApproval } from './cicd/forbid-workflow-pr-approval.ts';
import { rule as autoDeleteHeadBranches } from './repo-config/auto-delete-head-branches.ts';
import { rule as blockForcePush } from './repo-config/block-force-push.ts';
import { rule as branchCount } from './repo-config/branch-count.ts';
import { rule as branchProtectionRequired } from './repo-config/branch-protection-required.ts';
import { rule as descriptionPresent } from './repo-config/description-present.ts';
import { rule as dismissStaleReviews } from './repo-config/dismiss-stale-reviews.ts';
import { rule as enforceAdmins } from './repo-config/enforce-admins.ts';
import { rule as environmentProtection } from './repo-config/environment-protection.ts';
import { rule as forbidForkingPrivateRepos } from './repo-config/forbid-forking-private-repos.ts';
import { rule as licenseFilePresent } from './repo-config/license-file-present.ts';
import { rule as requireApprovingReviews } from './repo-config/require-approving-reviews.ts';
import {
	rule as requireConversationResolution,
} from './repo-config/require-conversation-resolution.ts';
import { rule as requireLinearHistory } from './repo-config/require-linear-history.ts';
import { rule as requirePullRequest } from './repo-config/require-pull-request.ts';
import { rule as requireSignedCommits } from './repo-config/require-signed-commits.ts';
import { rule as requireStatusChecks } from './repo-config/require-status-checks.ts';
import { rule as tagProtection } from './repo-config/tag-protection.ts';
import { rule as topicsPresent } from './repo-config/topics-present.ts';
import { rule as codeScanningEnabled } from './security/code-scanning-enabled.ts';
import { rule as dependabotAlertsEnabled } from './security/dependabot-alerts-enabled.ts';
import {
	rule as dependabotSecurityUpdatesEnabled,
} from './security/dependabot-security-updates-enabled.ts';
import {
	rule as privateVulnerabilityReporting,
} from './security/private-vulnerability-reporting.ts';
import { rule as scopeSecretsToEnvironments } from './security/scope-secrets-to-environments.ts';
import { rule as secretScanningEnabled } from './security/secret-scanning-enabled.ts';
import {
	rule as secretScanningPushProtection,
} from './security/secret-scanning-push-protection.ts';
import { rule as secretsRotation } from './security/secrets-rotation.ts';
import { rule as securityPolicyFile } from './security/security-policy-file.ts';
import type { Rule } from '../types/index.ts';

/**
 * All 40 built-in audit rules, spanning four categories:
 * repo-config, security, access, and cicd.
 *
 * The array is readonly and in a fixed order.
 */
export const allRules: readonly Rule[] = [
	branchProtectionRequired,
	requirePullRequest,
	requireApprovingReviews,
	blockForcePush,
	requireStatusChecks,
	dismissStaleReviews,
	requireConversationResolution,
	enforceAdmins,
	requireLinearHistory,
	requireSignedCommits,
	tagProtection,
	licenseFilePresent,
	autoDeleteHeadBranches,
	branchCount,
	environmentProtection,
	forbidForkingPrivateRepos,
	descriptionPresent,
	topicsPresent,
	dependabotAlertsEnabled,
	dependabotSecurityUpdatesEnabled,
	secretScanningEnabled,
	secretScanningPushProtection,
	scopeSecretsToEnvironments,
	secretsRotation,
	codeScanningEnabled,
	securityPolicyFile,
	privateVulnerabilityReporting,
	codeownersFilePresent,
	codeownersValid,
	requireCodeOwnerReviews,
	requiredCustomProperties,
	adminCount,
	outsideCollaboratorCount,
	teamBasedAdmin,
	visibilityPrivateDefault,
	webhooksUseHttps,
	deployKeysReadonly,
	actionsEnabled,
	defaultWorkflowPermissionsRead,
	forbidWorkflowPrApproval,
	forbidSelfHostedRunnersOnPublicRepos,
	actionsAllowlist,
];

/**
 * Look up a rule by its ID.
 *
 * @param id - The rule ID to search for (e.g. `"repo-config/block-force-push"`).
 * @returns The matching rule, or `undefined` if not found.
 */
export function findRuleById(id: string): Rule | undefined {
	return allRules.find(byId(id));
}

function byId(id: string) {
	return function matches(rule: Rule): boolean {
		return rule.id === id;
	};
}
