import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/members-cannot-create-public-pages';

const DETAIL = 'Members can publish public GitHub Pages sites. A Pages site ' +
	'built from a private repository serves its content publicly, so one ' +
	'member publishing a site is enough to expose private material.';

const REMEDIATION = 'Organization Settings -> Member privileges -> Pages ' +
	'creation: uncheck "Public". Members can still publish private Pages ' +
	'sites if those remain allowed.';

/**
 * Flags organisations where members can publish GitHub Pages sites
 * visible to the internet.
 */
export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'medium',
	summary: 'Members must not be able to publish public GitHub Pages sites',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		// Pages creation disabled entirely covers the public case.
		if (meta.membersCanCreatePages === false) {
			return [];
		}

		if (meta.membersCanCreatePublicPages === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanCreatePublicPages) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			org: ctx.org,
			title: 'Members can publish public GitHub Pages sites',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Managing the publication of GitHub Pages sites for your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/managing-the-publication-of-github-pages-sites-for-your-organization',
				},
			],
		};

		return [ finding ];
	},
};
