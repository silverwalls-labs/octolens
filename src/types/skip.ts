/**
 * Thrown by a rule (via the {@link skip} helper) when it could not perform
 * its check at all — e.g. the API returned a permission error or a
 * rate-limit, so the rule has no basis to pass OR fail.
 *
 * This is distinct from "not applicable" (return `[]`, counts as a pass).
 * `runRule()` catches `RuleSkipped` and records the run as `'skipped'`
 * rather than `'error'` or `'ok'`, so a coverage gap is never mistaken
 * for a clean pass.
 */
export class RuleSkipped extends Error {
	/**
	 * Create the skip signal.
	 *
	 * @param reason - Human-readable explanation (becomes `RuleRun.skipReason`).
	 */
	constructor(reason: string) {
		super(reason);
		this.name = 'RuleSkipped';
	}
}

/**
 * Signal that the current rule cannot run.
 *
 * @param  reason - Human-readable explanation (becomes `RuleRun.skipReason`).
 * @throws {RuleSkipped} Always — the `never` return type tells TypeScript
 * that control flow does not continue past this call.
 */
export function skip(reason: string): never {
	throw new RuleSkipped(reason);
}
