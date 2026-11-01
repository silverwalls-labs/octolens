import { getRepoMetadata } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories with push protection turned off.
 */
export const rule = defineRule({
	id: 'security/secret-scanning-push-protection',
	category: 'security',
	defaultSeverity: 'high',
	summary: 'Secret-scanning push protection must be enabled',

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const status = meta.securityAndAnalysis?.secretScanningPushProtection?.status;

		if (status === 'enabled') {
			return null;
		}

		return {
			title: 'Secret scanning push protection is disabled',
			detail: 'Secret-scanning push protection is not enabled. ' +
				'Without it, pushes containing recognized credentials are accepted into history ' +
				'and only flagged after the fact, increasing exposure window.',
			remediation: 'Settings -> Code security -> Secret scanning -> ' +
				'enable "Push protection". Requires secret scanning to be enabled.',
			references: [
				{
					name: 'Push protection for repositories',
					url: 'https://docs.github.com/en/code-security/secret-scanning/push-protection-for-repositories-and-organizations',
				},
			],
		};
	},
});
