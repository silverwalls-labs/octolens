import { getAutomatedSecurityFixesEnabled } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories with automated security fixes turned off.
 */
export const rule = defineRule({
	id: 'security/dependabot-security-updates-enabled',
	category: 'security',
	defaultSeverity: 'high',
	summary: 'Dependabot security updates must be enabled',

	async check(ctx) {
		const enabled = await getAutomatedSecurityFixesEnabled(ctx.octokit, ctx.cache, ctx.repo);

		if (enabled) {
			return null;
		}

		return {
			title: 'Dependabot security updates are disabled',
			detail: 'Dependabot security updates are disabled. ' +
				'Vulnerable dependencies will be flagged but no automated fix PRs will be opened.',
			remediation: 'Settings -> Code security -> Dependabot security updates: enable. ' +
				'Requires Dependabot alerts to also be enabled.',
			references: [
				{
					name: 'About Dependabot security updates',
					url: 'https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates',
				},
			],
		};
	},
});
