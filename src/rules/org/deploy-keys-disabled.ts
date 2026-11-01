import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations that still permit repository deploy keys.
 */
export const rule = defineOrgRule({
	id: 'org/deploy-keys-disabled',
	defaultSeverity: 'medium',
	summary: 'Deploy keys should be disabled organisation-wide',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.deployKeysEnabledForRepositories === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.deployKeysEnabledForRepositories) {
			return null;
		}

		return {
			title: 'Deploy keys are enabled for repositories',
			detail: 'Repositories in the organisation may use deploy keys. Deploy ' +
				'keys are long-lived SSH credentials tied to no user account: they bypass ' +
				'2FA and SSO, are rarely rotated, and often outlive the machine or person ' +
				'they were created for.',
			remediation: 'Organization Settings -> Member privileges -> Deploy keys: ' +
				'disable deploy keys for all repositories. Use short-lived credentials ' +
				'instead (GitHub App installation tokens or OIDC in Actions).',
			references: [
				{
					name: 'Managing deploy keys',
					url: 'https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys',
				},
			],
		};
	},
});
