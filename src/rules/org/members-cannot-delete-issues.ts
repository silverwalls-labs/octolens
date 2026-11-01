import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations where members can permanently delete issues.
 */
export const rule = defineOrgRule({
	id: 'org/members-cannot-delete-issues',
	defaultSeverity: 'low',
	summary: 'Members must not be able to permanently delete issues',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanDeleteIssues === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanDeleteIssues) {
			return null;
		}

		return {
			title: 'Members can permanently delete issues',
			detail: 'Members with admin permissions on a repository can permanently ' +
				'delete issues. Deleted issues are unrecoverable, destroying discussion ' +
				'history and audit trail — including evidence of reported vulnerabilities.',
			remediation: 'Organization Settings -> Member privileges -> Issue ' +
				'deletion: uncheck "Allow repository administrators to delete issues for ' +
				'this organization". Issue deletion then requires an organisation owner.',
			references: [
				{
					name: 'Allowing people to delete issues in your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/allowing-people-to-delete-issues-in-your-organization',
				},
			],
		};
	},
});
