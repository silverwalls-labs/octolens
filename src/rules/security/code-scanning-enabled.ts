import { getCodeScanningStatus } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'security/code-scanning-enabled';

const DETAIL = 'No code scanning analyses were found. Static analysis findings will not ' +
	'be surfaced for this repository.';

const REMEDIATION = 'Set up code scanning: ' +
	'Security -> Code scanning -> Set up. CodeQL works for most languages out of the box.';

/**
 * Flags repositories with no code scanning analyses on record.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'security',
	defaultSeverity: 'high',
	summary: 'Code scanning must be enabled',
	docs: RULE_ID,

	async check(ctx) {
		const status = await getCodeScanningStatus(ctx.octokit, ctx.cache, ctx.repo);

		if (status.hasAnalyses) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: 'Code scanning is not enabled',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'About code scanning',
					url: 'https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning',
				},
			],
		};

		return [ finding ];
	},
};
