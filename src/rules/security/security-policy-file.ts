import { getSecurityPolicyStatus } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories without a security policy in the standard locations.
 */
export const rule = defineRule({
	id: 'security/security-policy-file',
	category: 'security',
	defaultSeverity: 'medium',
	summary: 'A SECURITY.md disclosure policy must be present',

	async check(ctx) {
		const status = await getSecurityPolicyStatus(ctx.octokit, ctx.cache, ctx.repo);

		if (status.present) {
			return null;
		}

		return {
			title: 'No security policy (SECURITY.md) found',
			detail: 'No SECURITY.md file was found in the repository, so reporters do not have ' +
				'a documented disclosure path.',
			remediation: 'Add a SECURITY.md at the repository root or in .github/ describing ' +
				'how to report vulnerabilities.',
			references: [
				{
					name: 'Adding a security policy to your repository',
					url: 'https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository',
				},
			],
		};
	},
});
