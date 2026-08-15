import { getOrgPrivateForkPrWorkflows } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/limit-private-fork-pr-workflows';

const DETAIL = 'Workflows triggered by fork pull requests on private ' +
	'repositories run with dangerous privileges. A fork PR carries untrusted ' +
	'code; giving it write tokens or secrets lets an attacker with fork access ' +
	'exfiltrate credentials or push changes.';

const REMEDIATION = 'Organization Settings -> Actions -> General -> Fork pull ' +
	'request workflows in private repositories: uncheck "Send write tokens to ' +
	'workflows from fork pull requests" and "Send secrets and variables to ' +
	'workflows from fork pull requests", and check "Require approval for fork ' +
	'pull request workflows".';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'high',
	summary: 'Private-repo fork PR workflows must not get write tokens or secrets',
	docs: RULE_ID,

	async check(ctx) {
		const settings = await getOrgPrivateForkPrWorkflows(ctx.octokit, ctx.cache, ctx.org);

		if (!settings.checked) {
			return skip('could not read organisation fork PR workflow settings (no permission)');
		}

		// Fork PR workflows disabled entirely on private repos: nothing runs.
		if (!settings.runWorkflowsFromForkPullRequests) {
			return [];
		}

		const weaknesses: string[] = [];

		if (settings.sendWriteTokensToWorkflows) {
			weaknesses.push('write tokens are sent to fork PR workflows');
		}
		if (settings.sendSecretsAndVariables) {
			weaknesses.push('secrets and variables are sent to fork PR workflows');
		}
		if (!settings.requireApprovalForForkPrWorkflows) {
			weaknesses.push('fork PR workflows run without admin approval');
		}

		if (weaknesses.length === 0) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			org: ctx.org,
			title: 'Private-repo fork PR workflows are over-privileged',
			detail: `${DETAIL} Weak settings: ${weaknesses.join('; ')}.`,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Security hardening for GitHub Actions',
					url: 'https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions',
				},
			],
		};

		return [ finding ];
	},
};
