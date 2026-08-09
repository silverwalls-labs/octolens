import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/require-signed-commits';

const DETAIL = 'The default branch does not require signed commits, so unsigned ' +
	'commits can land via merge or direct push. Signature requirements help detect ' +
	'tampered or impersonated commits.';

const REMEDIATION = 'In the default branch protection rule, enable ' +
	'"Require signed commits".';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Default branch should require signed commits',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const protection = await getBranchProtection(
			ctx.octokit,
			ctx.cache,
			ctx.repo,
			meta.defaultBranch,
		);

		if (!protection.exists || protection.requireSignedCommits) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: `Default branch '${meta.defaultBranch}' does not require signed commits`,
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'About commit signature verification',
					url: 'https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification',
				},
			],
		};

		return [ finding ];
	},
};
