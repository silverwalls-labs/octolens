import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/deploy-keys-disabled';

const DETAIL = 'Repositories in the organisation may use deploy keys. Deploy ' +
	'keys are long-lived SSH credentials tied to no user account: they bypass ' +
	'2FA and SSO, are rarely rotated, and often outlive the machine or person ' +
	'they were created for.';

const REMEDIATION = 'Organization Settings -> Member privileges -> Deploy keys: ' +
	'disable deploy keys for all repositories. Use short-lived credentials ' +
	'instead (GitHub App installation tokens or OIDC in Actions).';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'medium',
	summary: 'Deploy keys should be disabled organisation-wide',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.deployKeysEnabledForRepositories === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.deployKeysEnabledForRepositories) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			org: ctx.org,
			title: 'Deploy keys are enabled for repositories',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Managing deploy keys',
					url: 'https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys',
				},
			],
		};

		return [ finding ];
	},
};
