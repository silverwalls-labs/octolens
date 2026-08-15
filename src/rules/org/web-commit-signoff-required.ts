import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/web-commit-signoff-required';

const DETAIL = 'Commits made through the GitHub web interface do not require a ' +
	'sign-off. Without a Signed-off-by trailer there is no explicit attestation ' +
	'trail for web-UI edits. Note this is DCO sign-off (attribution), not ' +
	'cryptographic commit signing — enforce signing per-repo via branch ' +
	'protection.';

const REMEDIATION = 'Organization Settings -> Repository -> "Require ' +
	'contributors to sign off on web-based commits". Commits made in the web ' +
	'UI then carry a Signed-off-by trailer from the author.';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'low',
	summary: 'Web-based commits must require contributor sign-off',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.webCommitSignoffRequired === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (meta.webCommitSignoffRequired) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'low',
			org: ctx.org,
			title: 'Web-based commits do not require sign-off',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Managing the commit signoff policy for your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/managing-the-commit-signoff-policy-for-your-organization',
				},
			],
		};

		return [ finding ];
	},
};
