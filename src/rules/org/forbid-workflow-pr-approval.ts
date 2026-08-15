import { getOrgDefaultWorkflowPermissions } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/forbid-workflow-pr-approval';

const DETAIL = 'GitHub Actions workflows are allowed to create and approve pull ' +
	'requests organisation-wide. A workflow can approve its own PR, satisfying ' +
	'required-review protections without any human involvement.';

const REMEDIATION = 'Organization Settings -> Actions -> General -> Workflow ' +
	'permissions: uncheck "Allow GitHub Actions to create and approve pull ' +
	'requests".';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'high',
	summary: 'Workflows must not be able to approve pull requests organisation-wide',
	docs: RULE_ID,

	async check(ctx) {
		const perms = await getOrgDefaultWorkflowPermissions(ctx.octokit, ctx.cache, ctx.org);

		if (!perms.checked) {
			return skip('could not read organisation workflow permissions (no permission)');
		}

		if (!perms.canApprovePullRequestReviews) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			org: ctx.org,
			title: 'Workflows can create and approve pull requests',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Preventing GitHub Actions from creating or approving pull requests',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization#preventing-github-actions-from-creating-or-approving-pull-requests',
				},
			],
		};

		return [ finding ];
	},
};
