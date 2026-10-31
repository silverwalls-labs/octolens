import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations where members can publish GitHub Pages sites
 * visible to the internet.
 */
export const rule = defineOrgRule({
	id: 'org/members-cannot-create-public-pages',
	defaultSeverity: 'medium',
	summary: 'Members must not be able to publish public GitHub Pages sites',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		// Pages creation disabled entirely covers the public case.
		if (meta.membersCanCreatePages === false) {
			return null;
		}

		if (meta.membersCanCreatePublicPages === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanCreatePublicPages) {
			return null;
		}

		return {
			title: 'Members can publish public GitHub Pages sites',
			detail: 'Members can publish public GitHub Pages sites. A Pages site ' +
				'built from a private repository serves its content publicly, so one ' +
				'member publishing a site is enough to expose private material.',
			remediation: 'Organization Settings -> Member privileges -> Pages ' +
				'creation: uncheck "Public". Members can still publish private Pages ' +
				'sites if those remain allowed.',
			references: [
				{
					name: 'Managing the publication of GitHub Pages sites for your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/managing-the-publication-of-github-pages-sites-for-your-organization',
				},
			],
		};
	},
});
