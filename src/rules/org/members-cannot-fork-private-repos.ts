import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/members-cannot-fork-private-repos';

const DETAIL = 'Members can fork private and internal repositories. Forks copy ' +
	'the full history outside the source repository\'s access controls and ' +
	'survive after the member loses access to the original.';

const REMEDIATION = 'Organization Settings -> Member privileges -> Repository ' +
	'forking: uncheck "Allow forking of private repositories".';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'high',
	summary: 'Members must not be able to fork private repositories',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanForkPrivateRepositories === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanForkPrivateRepositories) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			org: ctx.org,
			title: 'Members can fork private repositories',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Managing the forking policy for your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/managing-the-forking-policy-for-your-organization',
				},
			],
		};

		return [ finding ];
	},
};
