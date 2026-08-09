export const SEVERITIES = [
	'critical',
	'high',
	'medium',
	'low',
	'info',
] as const;

export type Severity = typeof SEVERITIES[number];

const SEVERITY_RANK: Record<Severity, number> = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
	info: 0,
};

export function isSeverity(value: string): value is Severity {
	return (SEVERITIES as readonly string[]).includes(value);
}

export function compareSeverity(a: Severity, b: Severity): number {
	return SEVERITY_RANK[b] - SEVERITY_RANK[a];
}

export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
	return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}
