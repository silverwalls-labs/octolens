import { getAutomatedSecurityFixesEnabled } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'security/dependabot-security-updates-enabled';

const DETAIL = 'Dependabot security updates are disabled. ' +
	'Vulnerable dependencies will be flagged but no automated fix PRs will be opened.';

const REMEDIATION = 'Settings -> Code security -> Dependabot security updates: enable. ' +
	'Requires Dependabot alerts to also be enabled.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'security',
	defaultSeverity: 'high',
	summary: 'Dependabot security updates must be enabled',
	docs: RULE_ID,

	async check(ctx) {
		const enabled = await getAutomatedSecurityFixesEnabled(ctx.octokit, ctx.cache, ctx.repo);

		if (enabled) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: 'Dependabot security updates are disabled',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'About Dependabot security updates',
					url: 'https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates',
				},
			],
		};

		return [ finding ];
	},
};
