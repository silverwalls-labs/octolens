import { getOrgDefaultWorkflowPermissions } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations that allow workflows to approve pull requests
 * anywhere in the organisation.
 */
export const rule = defineOrgRule({
	id: 'org/forbid-workflow-pr-approval',
	defaultSeverity: 'high',
	summary: 'Workflows must not be able to approve pull requests organisation-wide',

	async check(ctx) {
		const perms = await getOrgDefaultWorkflowPermissions(ctx.octokit, ctx.cache, ctx.org);

		if (!perms.checked) {
			return skip('could not read organisation workflow permissions (no permission)');
		}

		if (!perms.canApprovePullRequestReviews) {
			return null;
		}

		return {
			title: 'Workflows can create and approve pull requests',
			detail: 'GitHub Actions workflows are allowed to create and approve pull ' +
				'requests organisation-wide. A workflow can approve its own PR, satisfying ' +
				'required-review protections without any human involvement.',
			remediation: 'Organization Settings -> Actions -> General -> Workflow ' +
				'permissions: uncheck "Allow GitHub Actions to create and approve pull ' +
				'requests".',
			references: [
				{
					name: 'Preventing GitHub Actions from creating or approving pull requests',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization#preventing-github-actions-from-creating-or-approving-pull-requests',
				},
			],
		};
	},
});
