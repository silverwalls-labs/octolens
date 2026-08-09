import { getCodeownersFilePresent } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'access/codeowners-file-present';

const DETAIL = 'No CODEOWNERS file was found, so GitHub cannot route review requests by ' +
	'path or enforce code-owner approvals.';

const REMEDIATION = 'Add a CODEOWNERS file at the repository root or under .github/.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'A CODEOWNERS file must be present',
	docs: RULE_ID,

	async check(ctx) {
		const present = await getCodeownersFilePresent(ctx.octokit, ctx.cache, ctx.repo);

		if (present) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: 'No CODEOWNERS file found',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'About code owners',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners',
				},
			],
		};

		return [ finding ];
	},
};
