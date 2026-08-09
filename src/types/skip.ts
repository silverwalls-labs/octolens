/*
 * A rule throws RuleSkipped (via the skip() helper) when it could not perform
 * its check at all — e.g. the underlying API returned a permission error or a
 * rate-limit, so the rule has no basis to pass OR fail. This is distinct from
 * "not applicable" (a rule that legitimately does not apply to this repo, such
 * as a public-only rule on a private repo) — those return [] and count as a
 * pass. runRule() catches RuleSkipped and records the run as `skipped` rather
 * than `error` or `ok`, so a coverage gap is never mistaken for a clean pass.
 */
export class RuleSkipped extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'RuleSkipped';
	}
}

export function skip(reason: string): never {
	throw new RuleSkipped(reason);
}
