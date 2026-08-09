import { RuleSkipped } from '../types/index.ts';
import type { Rule, RuleContext } from '../types/index.ts';
import type { RuleRun } from '../types/index.ts';

/**
 * Execute a single rule and wrap the outcome in a {@link RuleRun}.
 *
 * Never throws — all exceptions are caught and encoded into the returned
 * `RuleRun` as either `'skipped'` (for {@link RuleSkipped}) or `'error'`.
 *
 * @param rule - The rule to execute.
 * @param context - Dependencies injected into the rule's `check()` method.
 * @returns The execution result including status, findings, and timing.
 */
export async function runRule(rule: Rule, context: RuleContext): Promise<RuleRun> {
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
