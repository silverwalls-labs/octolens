import { getSecurityPolicyStatus } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'security/security-policy-file';

const DETAIL = 'No SECURITY.md file was found in the repository, so reporters do not have ' +
	'a documented disclosure path.';

const REMEDIATION = 'Add a SECURITY.md at the repository root or in .github/ describing ' +
	'how to report vulnerabilities.';

/**
 * Flags repositories without a security policy in the standard locations.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'security',
	defaultSeverity: 'medium',
	summary: 'A SECURITY.md disclosure policy must be present',
	docs: RULE_ID,

	async check(ctx) {
		const status = await getSecurityPolicyStatus(ctx.octokit, ctx.cache, ctx.repo);

		if (status.present) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: 'No security policy (SECURITY.md) found',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Adding a security policy to your repository',
					url: 'https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository',
				},
			],
		};

		return [ finding ];
	},
};
