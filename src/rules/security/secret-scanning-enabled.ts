import { getRepoMetadata } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'security/secret-scanning-enabled';

const DETAIL = 'Secret scanning is disabled, so leaked credentials in the repository ' +
	'will not be detected.';

const REMEDIATION = 'Enable secret scanning: ' +
	'Settings -> Code security -> Secret scanning.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'security',
	defaultSeverity: 'high',
	summary: 'Secret scanning must be enabled',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const status = meta.securityAndAnalysis?.secretScanning?.status;

		if (status === 'enabled') {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: 'Secret scanning is disabled',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'About secret scanning',
					url: 'https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning',
				},
			],
		};

		return [ finding ];
	},
};
