import { getEnvironments } from '../../github/queries.ts';
import type { EnvironmentSummary } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/environment-protection';

const DETAIL_PREFIX = 'Environment has no protection rules. ' +
	'Any successful workflow run can deploy to it without review, branch restriction, ' +
	'or wait timer.';

const REMEDIATION = 'Settings -> Environments -> <environment>: add at least one ' +
	'protection rule (required reviewers, deployment branch policy, or wait timer).';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Environments must have at least one protection rule',
	docs: RULE_ID,

	async check(ctx) {
		const inventory = await getEnvironments(ctx.octokit, ctx.cache, ctx.repo);

		if (!inventory.checked) {
			return skip('could not list environments (no permission)');
		}

		return inventory.environments
			.filter(isUnprotected)
			.map((env) => buildFinding(ctx.repo, env));
	},
};

function isUnprotected(env: EnvironmentSummary): boolean {
	return !env.hasReviewers && !env.hasBranchPolicy && !env.hasWaitTimer;
}

function buildFinding(
	repo: { owner: string; name: string; },
	env: EnvironmentSummary,
): Finding {
	return {
		ruleId: RULE_ID,
		severity: 'medium',
		repo,
		title: `Environment '${env.name}' has no protection rules`,
		detail: DETAIL_PREFIX,
		remediation: REMEDIATION,
		references: [
			{
				name: 'Using environments for deployment',
				url: 'https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment',
			},
		],
	};
}
