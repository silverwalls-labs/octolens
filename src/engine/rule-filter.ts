import picomatch from 'picomatch';

/**
 * Filter rules by glob patterns applied to their IDs.
 *
 * When `only` is non-empty, only rules whose ID matches at least one
 * pattern are kept. When `skip` is non-empty, rules whose ID matches
 * at least one pattern are removed. When both are given, `only` narrows
 * first, then `skip` excludes from the narrowed set.
 *
 * @param    rules        - Rules to filter.
 * @param    options      - Include and exclude glob patterns.
 * @param    options.only - Glob patterns to include (OR'd). Empty means all.
 * @param    options.skip - Glob patterns to exclude (OR'd). Empty means none.
 * @returns               The filtered rule subset.
 * @template R            - Rule shape carrying an `id`.
 */
export function filterRulesByGlob<R extends { id: string; }>(
	rules: readonly R[],
	options: { only: readonly string[]; skip: readonly string[]; },
): R[] {
	let result: R[] = [ ...rules ];

	if (options.only.length > 0) {
		const match = picomatch([ ...options.only ]);

		result = result.filter((r) => match(r.id));
	}

	if (options.skip.length > 0) {
		const match = picomatch([ ...options.skip ]);

		result = result.filter((r) => !match(r.id));
	}

	return result;
}

/**
 * Return the subset of glob patterns that matched zero known IDs.
 *
 * Used for fail-loud validation: a pattern that matches nothing is
 * likely a typo that should abort the scan rather than silently running
 * an unfiltered (or empty) rule set.
 *
 * @param knownIds - All known rule IDs.
 * @param patterns - Glob patterns to validate.
 * @returns        Patterns that matched no known ID.
 */
export function unmatchedPatterns(
	knownIds: readonly string[],
	patterns: readonly string[],
): string[] {
	return patterns.filter((pattern) => !knownIds.some((id) => picomatch.isMatch(id, pattern)));
}
