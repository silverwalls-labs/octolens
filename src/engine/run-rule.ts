import { RuleSkipped } from '../types/index.ts';
import type {
	Finding, OrgRuleContext, RuleContext,
} from '../types/index.ts';
import type { RuleRun } from '../types/index.ts';

/**
 * Execute a single rule and wrap the outcome in a {@link RuleRun}.
 *
 * Never throws — all exceptions are caught and encoded into the returned
 * `RuleRun` as either `'skipped'` (for {@link RuleSkipped}) or `'error'`.
 *
 * Generic over the context type so both repo-scoped ({@link RuleContext})
 * and org-scoped ({@link OrgRuleContext}) rules run through the same path.
 *
 * @param    rule       - The rule to execute.
 * @param    rule.id    - Unique rule identifier recorded on the run.
 * @param    rule.check - Callback that performs the actual check.
 * @param    context    - Dependencies injected into the rule's `check()` method.
 * @returns             The execution result including status, findings, and timing.
 * @template C          - Context type accepted by the rule.
 */
export async function runRule<C extends RuleContext | OrgRuleContext>(
	rule: { id: string; check(context: C): Promise<Finding[]>; },
	context: C,
): Promise<RuleRun> {
	const start = performance.now();

	try {
		const findings = await rule.check(context);

		return {
			ruleId: rule.id,
			status: 'ok',
			findings,
			durationMs: Math.round(performance.now() - start),
		};
	} catch (err) {
		if (err instanceof RuleSkipped) {
			return {
				ruleId: rule.id,
				status: 'skipped',
				findings: [],
				skipReason: err.message,
				durationMs: Math.round(performance.now() - start),
			};
		}

		return {
			ruleId: rule.id,
			status: 'error',
			findings: [],
			error: err instanceof Error ?
				err.message :
				String(err),
			durationMs: Math.round(performance.now() - start),
		};
	}
}
