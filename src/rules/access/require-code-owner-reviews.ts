import {
	getBranchProtection,
	getCodeownersFilePresent,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'access/require-code-owner-reviews';

const DETAIL = 'A CODEOWNERS file is committed to this repository, but the default ' +
	'branch protection rule does not require review from code owners. ' +
	'Pull requests touching owned paths can merge without owner approval.';

const REMEDIATION = 'In the default branch protection rule, enable ' +
	'"Require review from Code Owners" alongside required pull-request reviews.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'Code owner reviews must be required when CODEOWNERS is present',
	docs: RULE_ID,

	async check(ctx) {
		const codeownersPresent = await getCodeownersFilePresent(
			ctx.octokit,
			ctx.cache,
			ctx.repo,
		);

		if (!codeownersPresent) {
			return skip('no CODEOWNERS file present');
		}

		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const protection = await getBranchProtection(
			ctx.octokit,
			ctx.cache,
			ctx.repo,
			meta.defaultBranch,
		);

		if (!protection.exists) {
			return skip('default branch has no protection rule');
		}

		if (protection.requireCodeOwnerReviews) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: 'Code owner reviews are not required',
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
