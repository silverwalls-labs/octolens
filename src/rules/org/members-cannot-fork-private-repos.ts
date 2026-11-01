import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations where members can fork private repositories
 * to personal accounts.
 */
export const rule = defineOrgRule({
	id: 'org/members-cannot-fork-private-repos',
	defaultSeverity: 'high',
	summary: 'Members must not be able to fork private repositories',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanForkPrivateRepositories === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanForkPrivateRepositories) {
			return null;
		}

		return {
			title: 'Members can fork private repositories',
			detail: 'Members can fork private and internal repositories. Forks copy ' +
				'the full history outside the source repository\'s access controls and ' +
				'survive after the member loses access to the original.',
			remediation: 'Organization Settings -> Member privileges -> Repository ' +
				'forking: uncheck "Allow forking of private repositories".',
			references: [
				{
					name: 'Managing the forking policy for your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/managing-the-forking-policy-for-your-organization',
				},
			],
		};
	},
});
