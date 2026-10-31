import { getRepoMetadata } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories with secret scanning turned off.
 */
export const rule = defineRule({
	id: 'security/secret-scanning-enabled',
	category: 'security',
	defaultSeverity: 'high',
	summary: 'Secret scanning must be enabled',

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const status = meta.securityAndAnalysis?.secretScanning?.status;

		if (status === 'enabled') {
			return null;
		}

		return {
			title: 'Secret scanning is disabled',
			detail: 'Secret scanning is disabled, so leaked credentials in the repository ' +
				'will not be detected.',
			remediation: 'Enable secret scanning: ' +
				'Settings -> Code security -> Secret scanning.',
			references: [
				{
					name: 'About secret scanning',
					url: 'https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning',
				},
			],
		};
	},
});
