import { getDefaultWorkflowPermissions } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories where workflows are allowed to approve pull
 * requests, which can be abused to bypass review.
 */
export const rule = defineRule({
	id: 'cicd/forbid-workflow-pr-approval',
	category: 'cicd',
	defaultSeverity: 'high',
	summary: 'Workflows must not be allowed to approve pull requests',

	async check(ctx) {
		const perms = await getDefaultWorkflowPermissions(ctx.octokit, ctx.cache, ctx.repo);

		if (!perms.checked) {
			return skip('could not read workflow permissions (no permission)');
		}

		if (!perms.canApprovePullRequestReviews) {
			return null;
		}

		return {
			title: 'Workflows can approve pull requests',
			detail: 'GitHub Actions workflows are allowed to approve pull requests. ' +
				'A compromised or careless workflow can satisfy required-approving-review checks ' +
				'without human sign-off and bypass branch protection.',
			remediation: 'Settings -> Actions -> General: uncheck ' +
				'"Allow GitHub Actions to create and approve pull requests".',
			references: [
				{
					name: 'Preventing GitHub Actions from approving pull requests',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository',
				},
			],
		};
	},
});
