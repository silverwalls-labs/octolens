import { getEnvironments } from '../../github/queries.ts';
import type { EnvironmentSummary } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';
import type { FindingBody } from '../define.ts';

/**
 * Flags deployment environments that have neither reviewers nor a
 * wait timer configured.
 */
export const rule = defineRule({
	id: 'repo-config/environment-protection',
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Environments must have at least one protection rule',

	async check(ctx) {
		const inventory = await getEnvironments(ctx.octokit, ctx.cache, ctx.repo);

		if (!inventory.checked) {
			return skip('could not list environments (no permission)');
		}

		return inventory.environments
			.filter(isUnprotected)
			.map(buildFindingBody);
	},
});

/**
 * Check whether an environment has no protection rules.
 *
 * @param env - Environment to inspect.
 * @returns   True when no protection rule exists.
 */
function isUnprotected(env: EnvironmentSummary): boolean {
	return !env.hasReviewers && !env.hasBranchPolicy && !env.hasWaitTimer;
}

/**
 * Build the finding body for an unprotected environment.
 *
 * @param env - Environment to report.
 * @returns   Title, detail, and remediation for the given environment.
 */
function buildFindingBody(env: EnvironmentSummary): FindingBody {
	return {
		title: `Environment '${env.name}' has no protection rules`,
		detail: 'Environment has no protection rules. ' +
			'Any successful workflow run can deploy to it without review, branch restriction, ' +
			'or wait timer.',
		remediation: 'Settings -> Environments -> <environment>: add at least one ' +
			'protection rule (required reviewers, deployment branch policy, or wait timer).',
		references: [
			{
				name: 'Using environments for deployment',
				url: 'https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment',
			},
		],
	};
}
