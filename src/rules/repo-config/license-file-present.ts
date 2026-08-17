import { getRepoMetadata } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/license-file-present';

const DETAIL = 'GitHub did not detect a license for this repository. Without a license, ' +
	'others cannot legally reuse the code.';

const REMEDIATION = 'Add a LICENSE file at the repository root using a standard SPDX ' +
	'identifier such as MIT or Apache-2.0.';

/**
 * Flags repositories where GitHub detects no license.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Repository must have a detected license',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.license && meta.license.spdxId && meta.license.spdxId !== 'NOASSERTION') {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: 'No license detected',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Licensing a repository',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository',
				},
			],
		};

		return [ finding ];
	},
};
