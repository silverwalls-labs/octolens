import { getCodeownersErrors } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'access/codeowners-valid';

const DETAIL = 'GitHub reported errors in the CODEOWNERS file (e.g. unknown user, unparseable ' +
	'pattern). Affected paths will not enforce code-owner reviews.';

const REMEDIATION = 'Open the CODEOWNERS errors view in the repository ' +
	'(/community or .github/CODEOWNERS) and fix the listed issues.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'access',
	defaultSeverity: 'high',
	summary: 'CODEOWNERS file must have no errors',
	docs: RULE_ID,

	async check(ctx) {
		const result = await getCodeownersErrors(ctx.octokit, ctx.cache, ctx.repo);

		if (!result.checked || result.errorCount === 0) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: `CODEOWNERS file has ${result.errorCount} error(s)`,
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
