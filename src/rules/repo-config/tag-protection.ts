import { getRepoRulesets } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/tag-protection';

const DETAIL = 'No active ruleset targets tags, so anyone with write access can create, ' +
	'move, or delete tags (including release tags) without review.';

const REMEDIATION = 'Add a tag ruleset under Settings -> Rules -> Rulesets, target tags, ' +
	'and set enforcement to "Active".';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Tags must be protected by an active ruleset',
	docs: RULE_ID,

	async check(ctx) {
		const rulesets = await getRepoRulesets(ctx.octokit, ctx.cache, ctx.repo);
		const tagRulesets = rulesets.filter(isActiveTagRuleset);

		if (tagRulesets.length > 0) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: 'No active tag-protection ruleset',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'About rulesets',
					url: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets',
				},
			],
		};

		return [ finding ];
	},
};

type RulesetTargeting = {
	target: string;
	enforcement: string;
};

function isActiveTagRuleset(ruleset: RulesetTargeting): boolean {
	return ruleset.target === 'tag' && ruleset.enforcement === 'active';
}
