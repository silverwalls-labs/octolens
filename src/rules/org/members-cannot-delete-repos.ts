import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/members-cannot-delete-repos';

const DETAIL = 'Members with admin permissions on a repository can delete it or ' +
	'transfer it out of the organisation. A transfer to a personal account moves ' +
	'the full history outside organisational control in one click.';

const REMEDIATION = 'Organization Settings -> Member privileges -> Repository ' +
	'deletion and transfer: uncheck "Allow members to delete or transfer ' +
	'repositories for this organization". Deletion and transfer then require ' +
	'an organisation owner.';

/**
 * Flags organisations where members can delete or transfer repositories.
 */
export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'medium',
	summary: 'Members must not be able to delete or transfer repositories',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanDeleteRepositories === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanDeleteRepositories) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			org: ctx.org,
			title: 'Members can delete or transfer repositories',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Setting permissions for deleting or transferring repositories',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/setting-permissions-for-deleting-or-transferring-repositories-in-your-organization',
				},
			],
		};

		return [ finding ];
	},
};
