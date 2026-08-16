/**
 * Ordered list of severity levels, from most to least severe.
 *
 * Source of truth for the {@link Severity} type.
 */
export const SEVERITIES = [
	'critical',
	'high',
	'medium',
	'low',
	'info',
] as const;

/** Finding severity level. */
export type Severity = typeof SEVERITIES[number];

const SEVERITY_RANK: Record<Severity, number> = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
	info: 0,
};

/**
 * Type guard that checks whether a string is a valid {@link Severity}.
 *
 * @param value - The string to test.
 * @returns     `true` if `value` is one of the five severity levels.
 */
export function isSeverity(value: string): value is Severity {
	return (SEVERITIES as readonly string[]).includes(value);
}

/**
 * Compare two severities for sorting in descending (most-severe-first) order.
 *
 * Returns a negative number if `a` is more severe, zero if equal, or a
 * positive number if `a` is less severe. Suitable as an
 * `Array.prototype.sort` comparator.
 *
 * @param a - First severity.
 * @param b - Second severity.
 */
export function compareSeverity(a: Severity, b: Severity): number {
	return SEVERITY_RANK[b] - SEVERITY_RANK[a];
}

/**
 * Check whether a severity meets or exceeds a threshold.
 *
 * @example
 * ```ts
 * meetsThreshold('high', 'medium'); // true
 * meetsThreshold('low', 'high');    // false
 * ```
 * @param severity  - The severity to check.
 * @param threshold - The minimum required severity.
 * @returns         `true` if `severity` is at or above `threshold`.
 */
export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
	return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}
