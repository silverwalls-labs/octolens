import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations that accept web-based commits without
 * contributor sign-off.
 */
export const rule = defineOrgRule({
	id: 'org/web-commit-signoff-required',
	defaultSeverity: 'low',
	summary: 'Web-based commits must require contributor sign-off',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.webCommitSignoffRequired === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (meta.webCommitSignoffRequired) {
			return null;
		}

		return {
			title: 'Web-based commits do not require sign-off',
			detail: 'Commits made through the GitHub web interface do not require a ' +
				'sign-off. Without a Signed-off-by trailer there is no explicit attestation ' +
				'trail for web-UI edits. Note this is DCO sign-off (attribution), not ' +
				'cryptographic commit signing — enforce signing per-repo via branch ' +
				'protection.',
			remediation: 'Organization Settings -> Repository -> "Require ' +
				'contributors to sign off on web-based commits". Commits made in the web ' +
				'UI then carry a Signed-off-by trailer from the author.',
			references: [
				{
					name: 'Managing the commit signoff policy for your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/managing-the-commit-signoff-policy-for-your-organization',
				},
			],
		};
	},
});
