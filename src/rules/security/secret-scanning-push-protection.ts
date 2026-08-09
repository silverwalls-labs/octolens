import { getRepoMetadata } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'security/secret-scanning-push-protection';

const DETAIL = 'Secret-scanning push protection is not enabled. ' +
	'Without it, pushes containing recognized credentials are accepted into history ' +
	'and only flagged after the fact, increasing exposure window.';

const REMEDIATION = 'Settings -> Code security -> Secret scanning -> ' +
	'enable "Push protection". Requires secret scanning to be enabled.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'security',
	defaultSeverity: 'high',
	summary: 'Secret-scanning push protection must be enabled',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const status = meta.securityAndAnalysis?.secretScanningPushProtection?.status;

		if (status === 'enabled') {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: 'Secret scanning push protection is disabled',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Push protection for repositories',
					url: 'https://docs.github.com/en/code-security/secret-scanning/push-protection-for-repositories-and-organizations',
				},
			],
		};

		return [ finding ];
	},
};
