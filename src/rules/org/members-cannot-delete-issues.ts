import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/members-cannot-delete-issues';

const DETAIL = 'Members with admin permissions on a repository can permanently ' +
	'delete issues. Deleted issues are unrecoverable, destroying discussion ' +
	'history and audit trail — including evidence of reported vulnerabilities.';

const REMEDIATION = 'Organization Settings -> Member privileges -> Issue ' +
	'deletion: uncheck "Allow repository administrators to delete issues for ' +
	'this organization". Issue deletion then requires an organisation owner.';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'low',
	summary: 'Members must not be able to permanently delete issues',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanDeleteIssues === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanDeleteIssues) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'low',
			org: ctx.org,
			title: 'Members can permanently delete issues',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Allowing people to delete issues in your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/allowing-people-to-delete-issues-in-your-organization',
				},
			],
		};

		return [ finding ];
	},
};
