import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations where members can delete or transfer repositories.
 */
export const rule = defineOrgRule({
	id: 'org/members-cannot-delete-repos',
	defaultSeverity: 'medium',
	summary: 'Members must not be able to delete or transfer repositories',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanDeleteRepositories === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanDeleteRepositories) {
			return null;
		}

		return {
			title: 'Members can delete or transfer repositories',
			detail: 'Members with admin permissions on a repository can delete it or ' +
				'transfer it out of the organisation. A transfer to a personal account moves ' +
				'the full history outside organisational control in one click.',
			remediation: 'Organization Settings -> Member privileges -> Repository ' +
				'deletion and transfer: uncheck "Allow members to delete or transfer ' +
				'repositories for this organization". Deletion and transfer then require ' +
				'an organisation owner.',
			references: [
				{
					name: 'Setting permissions for deleting or transferring repositories',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/setting-permissions-for-deleting-or-transferring-repositories-in-your-organization',
				},
			],
		};
	},
});
