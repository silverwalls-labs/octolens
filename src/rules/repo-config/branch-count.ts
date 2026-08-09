import { getBranchCount } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/branch-count';
const BRANCH_THRESHOLD = 100;

const DETAIL = 'A high branch count usually means stale or abandoned branches accumulate ' +
	'in the repository. They clutter tooling, slow some Git operations, and can hide ' +
	'long-lived deviations from the default branch.';

const REMEDIATION = 'Enable "Automatically delete head branches" in Settings -> ' +
	'General -> Pull Requests, and prune merged or stale branches with ' +
	'`git branch --merged` or a scheduled cleanup job.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'low',
	summary: 'Repository should not accumulate excessive branches',
	docs: RULE_ID,

	async check(ctx) {
		const count = await getBranchCount(ctx.octokit, ctx.cache, ctx.repo);

		if (count <= BRANCH_THRESHOLD) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'low',
			repo: ctx.repo,
			title: `Repository has ${count} branches (threshold: ${BRANCH_THRESHOLD})`,
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
