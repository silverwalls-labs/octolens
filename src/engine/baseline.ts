import { readFileSync } from 'node:fs';
import type { Finding } from '../types/index.ts';

/** The target type extracted from a baseline report. */
export type BaselineTargetType = 'repo' | 'org' | 'org-fleet';

/** A validated baseline, ready for diffing. */
export type Baseline = {
	/** All findings extracted from the baseline report. */
	findings: Finding[];

	/** The target type of the baseline, for compatibility checking. */
	targetType: BaselineTargetType;
};

/** Thrown when a baseline file is invalid or incompatible. */
export class BaselineError extends Error {
	/**
	 * Create the error.
	 *
	 * @param message - Human-readable description of the problem.
	 * @param options - Standard `Error` options (e.g. `{ cause }`).
	 */
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'BaselineError';
	}
}

/** Target types that octolens emits. */
const VALID_TARGET_TYPES = new Set<string>([
	'repo',
	'org',
	'org-fleet',
]);

/**
 * Load and validate a baseline JSON file.
 *
 * Reads the file synchronously (consistent with {@link import('../config/loader.ts').loadConfig}),
 * parses JSON, and validates that the structure is a recognisable octolens
 * scan result. For `org-fleet` baselines the findings are flattened from
 * the org and all repo sub-results.
 *
 * @param    path - Path to the baseline JSON file.
 * @returns       The validated baseline.
 * @throws {BaselineError} On missing file, parse failure, or invalid structure.
 */
export function loadBaseline(path: string): Baseline {
	let raw: string;

	try {
		raw = readFileSync(path, 'utf8');
	} catch (cause) {
		throw new BaselineError(`Cannot read baseline file: ${path}`, { cause });
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch (cause) {
		throw new BaselineError(`Baseline file is not valid JSON: ${path}`, { cause });
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new BaselineError(`Baseline file must contain a JSON object: ${path}`);
	}

	const obj = parsed as Record<string, unknown>;

	if (obj['schemaVersion'] !== 1) {
		throw new BaselineError('Unsupported baseline schema version: ' +
			`${String(obj['schemaVersion'])}. Expected 1.`);
	}

	const target = obj['target'];

	if (typeof target !== 'object' || target === null || Array.isArray(target)) {
		throw new BaselineError(`Baseline file has no valid "target" field: ${path}`);
	}

	const targetType = (target as Record<string, unknown>)['type'];

	if (typeof targetType !== 'string' || !VALID_TARGET_TYPES.has(targetType)) {
		throw new BaselineError(`Unknown baseline target type: ${String(targetType)}. ` +
			'Expected "repo", "org", or "org-fleet".');
	}

	const findings = extractFindings(obj, targetType as BaselineTargetType, path);

	return { findings, targetType: targetType as BaselineTargetType };
}

/**
 * Assert that a baseline's target type is compatible with the current scan mode.
 *
 * @param  baseline - The loaded baseline.
 * @param  expected - The target type the current scan will produce.
 * @throws {BaselineError} When the types do not match.
 */
export function assertBaselineCompatible(
	baseline: Baseline,
	expected: BaselineTargetType,
): void {
	if (baseline.targetType !== expected) {
		throw new BaselineError(`Baseline target type "${baseline.targetType}" does not match ` +
			`the current scan mode "${expected}".`);
	}
}

/**
 * Extract findings from a parsed baseline object.
 *
 * For `org-fleet` baselines, findings are flattened from the org sub-result
 * and every repo sub-result, matching the pattern used by the SARIF
 * formatter's `collectEntries`.
 *
 * @param    obj        - The parsed JSON object.
 * @param    targetType - The baseline's target type.
 * @param    path       - File path for error messages.
 * @returns             The extracted findings array.
 * @throws {BaselineError} When the expected structure is missing.
 */
function extractFindings(
	obj: Record<string, unknown>,
	targetType: BaselineTargetType,
	path: string,
): Finding[] {
	if (targetType === 'org-fleet') {
		return extractFleetFindings(obj, path);
	}

	const findings = obj['findings'];

	if (!Array.isArray(findings)) {
		throw new BaselineError(`Baseline file has no "findings" array: ${path}`);
	}

	return findings as Finding[];
}

/**
 * Extract and flatten findings from an `org-fleet` baseline.
 *
 * @param    obj  - The parsed JSON object.
 * @param    path - File path for error messages.
 * @returns       The flattened findings from org + all repos.
 * @throws {BaselineError} When the expected structure is missing.
 */
function extractFleetFindings(
	obj: Record<string, unknown>,
	path: string,
): Finding[] {
	const org = obj['org'];

	if (typeof org !== 'object' || org === null || Array.isArray(org)) {
		throw new BaselineError(`Fleet baseline has no valid "org" field: ${path}`);
	}

	const orgFindings = (org as Record<string, unknown>)['findings'];

	if (!Array.isArray(orgFindings)) {
		throw new BaselineError(`Fleet baseline "org" has no "findings" array: ${path}`);
	}

	const repos = obj['repos'];

	if (!Array.isArray(repos)) {
		throw new BaselineError(`Fleet baseline has no "repos" array: ${path}`);
	}

	const repoFindings = repos.flatMap((repo: unknown) => {
		if (typeof repo !== 'object' || repo === null || Array.isArray(repo)) {
			throw new BaselineError(`Fleet baseline contains an invalid repo entry: ${path}`);
		}

		const findings = (repo as Record<string, unknown>)['findings'];

		if (!Array.isArray(findings)) {
			throw new BaselineError(`Fleet baseline repo entry has no "findings" array: ${path}`);
		}

		return findings as Finding[];
	});

	return [ ...(orgFindings as Finding[]), ...repoFindings ];
}
