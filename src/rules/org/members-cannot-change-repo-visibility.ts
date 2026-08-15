import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/members-cannot-change-repo-visibility';

const DETAIL = 'Members with admin permissions on a repository can change its ' +
	'visibility. A single repo admin can flip a private repository public — an ' +
	'instant data leak that bypasses the restriction on creating public repos.';

const REMEDIATION = 'Organization Settings -> Member privileges -> Repository ' +
	'visibility change: uncheck "Allow members to change repository ' +
	'visibilities for this organization". Visibility changes then require an ' +
	'organisation owner.';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'high',
	summary: 'Members must not be able to change repository visibility',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanChangeRepoVisibility === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanChangeRepoVisibility) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			org: ctx.org,
			title: 'Members can change repository visibility',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Restricting repository visibility changes in your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/restricting-repository-visibility-changes-in-your-organization',
				},
			],
		};

		return [ finding ];
	},
};
