import { getDefaultWorkflowPermissions } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'cicd/forbid-workflow-pr-approval';

const DETAIL = 'GitHub Actions workflows are allowed to approve pull requests. ' +
	'A compromised or careless workflow can satisfy required-approving-review checks ' +
	'without human sign-off and bypass branch protection.';

const REMEDIATION = 'Settings -> Actions -> General: uncheck ' +
	'"Allow GitHub Actions to create and approve pull requests".';

export const rule: Rule = {
	id: RULE_ID,
	category: 'cicd',
	defaultSeverity: 'high',
	summary: 'Workflows must not be allowed to approve pull requests',
	docs: RULE_ID,

	async check(ctx) {
		const perms = await getDefaultWorkflowPermissions(ctx.octokit, ctx.cache, ctx.repo);

		if (!perms.canApprovePullRequestReviews) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: 'Workflows can approve pull requests',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Preventing GitHub Actions from approving pull requests',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository',
				},
			],
		};

		return [ finding ];
	},
};
