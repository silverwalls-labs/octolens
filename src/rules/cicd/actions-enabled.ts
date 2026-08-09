import { getActionsPermissions } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'cicd/actions-enabled';

const DETAIL = 'GitHub Actions is disabled for this repository. ' +
	'No workflows will run, including any security or release automation.';

const REMEDIATION = 'If Actions is intentionally disabled, ignore this finding. ' +
	'Otherwise enable it under Settings -> Actions -> General.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'cicd',
	defaultSeverity: 'info',
	summary: 'GitHub Actions should be enabled',
	docs: RULE_ID,

	async check(ctx) {
		const perms = await getActionsPermissions(ctx.octokit, ctx.cache, ctx.repo);

		if (perms.enabled) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'info',
			repo: ctx.repo,
			title: 'GitHub Actions is disabled',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
