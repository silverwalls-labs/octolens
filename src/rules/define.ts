import type {
	Finding, OrgRule, OrgRuleContext, Reference,
	Rule, RuleCategory, RuleContext, Severity,
} from '../types/index.ts';

/**
 * The caller-supplied part of a {@link Finding}.
 *
 * Fields that the factory auto-fills (`ruleId`, `severity`, `repo`/`org`)
 * are omitted — callers supply only what varies per invocation.
 */
export type FindingBody = {
	title: string;
	detail?: string;
	remediation?: string;
	references?: Reference[];
};

/** Configuration accepted by {@link defineRule}. */
export type RepoRuleConfig = {
	id: string;
	category: Exclude<RuleCategory, 'org'>;
	defaultSeverity: Severity;
	summary: string;

	/**
	 * Rule check function.
	 *
	 * Return `null` for a clean pass, a {@link FindingBody} for a single
	 * finding, or an array of {@link FindingBody} for multiple findings.
	 * Call {@link import('../types/index.ts').skip | skip} to signal that the
	 * rule could not run.
	 */
	check: (ctx: RuleContext) => Promise<FindingBody | FindingBody[] | null>;
};

/** Configuration accepted by {@link defineOrgRule}. */
export type OrgRuleConfig = {
	id: string;
	defaultSeverity: Severity;
	summary: string;

	/**
	 * Rule check function.
	 *
	 * Return `null` for a clean pass, a {@link FindingBody} for a single
	 * finding, or an array of {@link FindingBody} for multiple findings.
	 * Call {@link import('../types/index.ts').skip | skip} to signal that the
	 * rule could not run.
	 */
	check: (ctx: OrgRuleContext) => Promise<FindingBody | FindingBody[] | null>;
};

/**
 * Define a repo-scoped rule with reduced boilerplate.
 *
 * The factory auto-fills `docs`, and constructs each {@link Finding}
 * with `ruleId`, `severity`, and `repo` derived from the config and
 * context — the caller's `check` function only returns the fields
 * that differ per invocation.
 *
 * @param config - Rule metadata and check function.
 * @returns      A fully formed {@link Rule}.
 */
export function defineRule(config: RepoRuleConfig): Rule {
	return {
		id: config.id,
		category: config.category,
		defaultSeverity: config.defaultSeverity,
		summary: config.summary,
		docs: config.id,

		async check(ctx: RuleContext): Promise<Finding[]> {
			const result = await config.check(ctx);

			if (result === null) return [];

			const items = Array.isArray(result) ?
				result :
				[ result ];

			return items.map((body) => ({
				ruleId: config.id,
				severity: config.defaultSeverity,
				repo: ctx.repo,
				...body,
			}));
		},
	};
}

/**
 * Define an org-scoped rule with reduced boilerplate.
 *
 * The factory auto-fills `docs` and `category` (`'org'`), and
 * constructs each {@link Finding} with `ruleId`, `severity`, and
 * `org` derived from the config and context.
 *
 * @param config - Rule metadata and check function.
 * @returns      A fully formed {@link OrgRule}.
 */
export function defineOrgRule(config: OrgRuleConfig): OrgRule {
	return {
		id: config.id,
		category: 'org',
		defaultSeverity: config.defaultSeverity,
		summary: config.summary,
		docs: config.id,

		async check(ctx: OrgRuleContext): Promise<Finding[]> {
			const result = await config.check(ctx);

			if (result === null) return [];

			const items = Array.isArray(result) ?
				result :
				[ result ];

			return items.map((body) => ({
				ruleId: config.id,
				severity: config.defaultSeverity,
				org: ctx.org,
				...body,
			}));
		},
	};
}
