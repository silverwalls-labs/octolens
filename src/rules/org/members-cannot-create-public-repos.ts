import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/members-cannot-create-public-repos';

const DETAIL = 'Any organisation member can create a public repository. One ' +
	'accidental `git push` to a member-created public repo is an immediate, ' +
	'indexable data leak — no compromised account required.';

const REMEDIATION = 'Organization Settings -> Member privileges -> Repository ' +
	'creation: uncheck "Public". Repositories that must be public can be made ' +
	'so deliberately by an owner.';

/**
 * Flags organisations where members can create repositories visible
 * to the internet.
 */
export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'high',
	summary: 'Members must not be able to create public repositories',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanCreatePublicRepositories === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanCreatePublicRepositories) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			org: ctx.org,
			title: 'Members can create public repositories',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Restricting repository creation in your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/restricting-repository-creation-in-your-organization',
				},
			],
		};

		return [ finding ];
	},
};
