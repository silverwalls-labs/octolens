import { getRepoRulesets } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories with no active ruleset targeting tags.
 */
export const rule = defineRule({
	id: 'repo-config/tag-protection',
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Tags must be protected by an active ruleset',

	async check(ctx) {
		const rulesets = await getRepoRulesets(ctx.octokit, ctx.cache, ctx.repo);
		const tagRulesets = rulesets.filter(isActiveTagRuleset);

		if (tagRulesets.length > 0) {
			return null;
		}

		return {
			title: 'No active tag-protection ruleset',
			detail: 'No active ruleset targets tags, so anyone with write access can create, ' +
				'move, or delete tags (including release tags) without review.',
			remediation: 'Add a tag ruleset under Settings -> Rules -> Rulesets, target tags, ' +
				'and set enforcement to "Active".',
			references: [
				{
					name: 'About rulesets',
					url: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets',
				},
			],
		};
	},
});

/**
 * Subset of a ruleset relevant to tag protection.
 */
type RulesetTargeting = {
	target: string;
	enforcement: string;
};

/**
 * Check whether a ruleset actively targets tags.
 *
 * @param ruleset - Ruleset to inspect.
 * @returns       True for active tag rulesets.
 */
function isActiveTagRuleset(ruleset: RulesetTargeting): boolean {
	return ruleset.target === 'tag' && ruleset.enforcement === 'active';
}
