import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations where members can create repositories visible
 * to the internet.
 */
export const rule = defineOrgRule({
	id: 'org/members-cannot-create-public-repos',
	defaultSeverity: 'high',
	summary: 'Members must not be able to create public repositories',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanCreatePublicRepositories === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanCreatePublicRepositories) {
			return null;
		}

		return {
			title: 'Members can create public repositories',
			detail: 'Any organisation member can create a public repository. One ' +
				'accidental `git push` to a member-created public repo is an immediate, ' +
				'indexable data leak — no compromised account required.',
			remediation: 'Organization Settings -> Member privileges -> Repository ' +
				'creation: uncheck "Public". Repositories that must be public can be made ' +
				'so deliberately by an owner.',
			references: [
				{
					name: 'Restricting repository creation in your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/restricting-repository-creation-in-your-organization',
				},
			],
		};
	},
});
