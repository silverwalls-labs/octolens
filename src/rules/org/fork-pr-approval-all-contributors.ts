import { getOrgForkPrApproval } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

const SAFE_POLICY = 'all_external_contributors';

/**
 * Flags organisations that only gate first-time contributors instead
 * of requiring approval for every external fork PR workflow run.
 */
export const rule = defineOrgRule({
	id: 'org/fork-pr-approval-all-contributors',
	defaultSeverity: 'medium',
	summary: 'Fork PR workflows must require approval for all external contributors',

	async check(ctx) {
		const policy = await getOrgForkPrApproval(ctx.octokit, ctx.cache, ctx.org);

		if (!policy.checked) {
			return skip('could not read organisation fork PR approval policy (no permission)');
		}

		if (policy.approvalPolicy === SAFE_POLICY) {
			return null;
		}

		return {
			title: 'Fork PR workflows do not require approval for all external contributors',
			detail: 'Fork pull request workflows only require approval for ' +
				'first-time contributors. That policy is bypassable by contribution ' +
				'farming: one merged typo-fix PR, and a malicious fork can run workflows ' +
				'against your code without any human approval.',
			remediation: 'Organization Settings -> Actions -> General -> Fork pull ' +
				'request workflows from outside collaborators: select "Require approval ' +
				'for all external contributors".',
			references: [
				{
					name: 'Approving workflow runs from forks',
					url: 'https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/approving-workflow-runs-from-public-forks',
				},
			],
		};
	},
});
