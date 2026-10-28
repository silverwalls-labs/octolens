import { readFileSync } from 'node:fs';
import type { Finding, Severity } from '../types/index.ts';
import { SEVERITIES, isSeverity } from '../types/index.ts';

/** The target type extracted from a baseline report. */
export type BaselineTargetType = 'repo' | 'org' | 'org-fleet';

/**
 * The target identity recorded in a baseline report.
 *
 * Repo targets carry `owner`/`name`; org and org-fleet targets carry `org`.
 * Used to reject a baseline produced for a different repo or organisation.
 */
export type BaselineTarget = {
	/** The target type. */
	type: BaselineTargetType;

	/** Repository owner (repo baselines). */
	owner?: string;

	/** Repository name (repo baselines). */
	name?: string;

	/** Organisation login (org and org-fleet baselines). */
	org?: string;
};

/** A validated baseline, ready for diffing. */
export type Baseline = {
	/** All findings extracted from the baseline report. */
	findings: Finding[];

	/** The target type of the baseline, for compatibility checking. */
	targetType: BaselineTargetType;

	/** The target identity of the baseline, for compatibility checking. */
	target: BaselineTarget;

	/** The severity threshold the baseline was produced with, if recorded. */
	threshold: Severity | undefined;
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
 * scan result — including every findings entry, so a malformed entry fails
 * here with a {@link BaselineError} instead of crashing inside the diff
 * later. For `org-fleet` baselines the findings are flattened from
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

	const targetObj = target as Record<string, unknown>;
	const targetType = targetObj['type'];

	if (typeof targetType !== 'string' || !VALID_TARGET_TYPES.has(targetType)) {
		throw new BaselineError(`Unknown baseline target type: ${String(targetType)}. ` +
			'Expected "repo", "org", or "org-fleet".');
	}

	const identity = parseTargetIdentity(targetObj, targetType as BaselineTargetType, path);
	const threshold = parseThreshold(obj, path);
	const findings = extractFindings(obj, targetType as BaselineTargetType, path);

	return {
		findings,
		targetType: targetType as BaselineTargetType,
		target: identity,
		threshold,
	};
}

/**
 * Assert that a baseline is compatible with the current scan: same target
 * type and same target identity. Identity comparison is case-insensitive
 * because GitHub logins are.
 *
 * @param  baseline - The loaded baseline.
 * @param  expected - The target the current scan will produce.
 * @throws {BaselineError} When the type or the target identity differs.
 */
export function assertBaselineCompatible(
	baseline: Baseline,
	expected: BaselineTarget,
): void {
	if (baseline.targetType !== expected.type) {
		throw new BaselineError(`Baseline target type "${baseline.targetType}" does not match ` +
			`the current scan mode "${expected.type}".`);
	}

	if (describeTarget(baseline.target).toLowerCase() !==
		describeTarget(expected).toLowerCase()) {
		throw new BaselineError(`Baseline was produced for ${describeTarget(baseline.target)} ` +
			`but the current scan targets ${describeTarget(expected)}.`);
	}
}

/**
 * Render a target identity for comparison and error messages.
 *
 * @param target - The target identity.
 * @returns      A human-readable description.
 */
function describeTarget(target: BaselineTarget): string {
	if (target.type === 'repo') {
		return `repo "${target.owner}/${target.name}"`;
	}

	return `${target.type} "${target.org}"`;
}

/**
 * Parse and validate the target identity fields of a baseline.
 *
 * @param    targetObj  - The raw `target` object of the baseline.
 * @param    targetType - The validated target type.
 * @param    path       - File path for error messages.
 * @returns             The parsed target identity.
 * @throws {BaselineError} When the identity fields are missing or malformed.
 */
function parseTargetIdentity(
	targetObj: Record<string, unknown>,
	targetType: BaselineTargetType,
	path: string,
): BaselineTarget {
	if (targetType === 'repo') {
		const owner = targetObj['owner'];
		const name = targetObj['name'];

		if (typeof owner !== 'string' || owner === '' ||
			typeof name !== 'string' || name === '') {
			throw new BaselineError('Baseline repo target has no "owner"/"name" ' +
				`strings: ${path}`);
		}

		return {
			type: targetType, owner, name,
		};
	}

	const org = targetObj['org'];

	if (typeof org !== 'string' || org === '') {
		throw new BaselineError(`Baseline target has no "org" string: ${path}`);
	}

	return { type: targetType, org };
}

/**
 * Parse the severity threshold a baseline was produced with.
 *
 * A missing threshold is tolerated (older or hand-written baselines) and
 * returned as `undefined`; an invalid one is rejected.
 *
 * @param    obj  - The parsed baseline object.
 * @param    path - File path for error messages.
 * @returns       The recorded threshold, or `undefined`.
 * @throws {BaselineError} When the recorded threshold is not a severity.
 */
function parseThreshold(obj: Record<string, unknown>, path: string): Severity | undefined {
	const raw = obj['threshold'];

	if (raw === undefined) {
		return undefined;
	}

	if (typeof raw !== 'string' || !isSeverity(raw)) {
		throw new BaselineError(`Baseline has an invalid "threshold": ${String(raw)}. ` +
			`Expected one of ${SEVERITIES.join(', ')}: ${path}`);
	}

	return raw;
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

	return validateFindings(obj['findings'], path, 'findings');
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

	const orgFindings = validateFindings(
		(org as Record<string, unknown>)['findings'],
		path,
		'"org" findings',
	);

	const repos = obj['repos'];

	if (!Array.isArray(repos)) {
		throw new BaselineError(`Fleet baseline has no "repos" array: ${path}`);
	}

	const repoFindings = repos.flatMap((repo: unknown, index: number) => {
		if (typeof repo !== 'object' || repo === null || Array.isArray(repo)) {
			throw new BaselineError(`Fleet baseline contains an invalid repo entry: ${path}`);
		}

		return validateFindings(
			(repo as Record<string, unknown>)['findings'],
			path,
			`"repos[${index}]" findings`,
		);
	});

	return [ ...orgFindings, ...repoFindings ];
}

/**
 * Validate a raw findings array and cast it to `Finding[]`.
 *
 * Every entry must be an object with a string `ruleId`, a valid `severity`,
 * a string `title`, and — when present — a well-formed `repo` ref or `org`
 * login. Entries are validated up front so a malformed baseline fails with
 * a {@link BaselineError} instead of producing a `TypeError` inside the
 * diff, or silently fingerprinting garbage as `undefined::undefined`.
 *
 * @param    raw   - The raw value of a `findings` field.
 * @param    path  - File path for error messages.
 * @param    where - Which findings array is being validated (for messages).
 * @returns        The validated findings.
 * @throws {BaselineError} When the value is not an array or an entry is malformed.
 */
function validateFindings(raw: unknown, path: string, where: string): Finding[] {
	if (!Array.isArray(raw)) {
		throw new BaselineError(`Baseline ${where} is not an array: ${path}`);
	}

	return raw.map((entry, index) => validateFinding(entry, path, where, index));
}

/**
 * Validate a single baseline findings entry.
 *
 * @param    entry - The raw entry.
 * @param    path  - File path for error messages.
 * @param    where - Which findings array the entry belongs to.
 * @param    index - Position of the entry within the array.
 * @returns        The validated finding.
 * @throws {BaselineError} When the entry is not a well-formed finding.
 */
function validateFinding(
	entry: unknown,
	path: string,
	where: string,
	index: number,
): Finding {
	const at = `Baseline ${where}[${index}]`;

	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		throw new BaselineError(`${at} is not a finding object: ${path}`);
	}

	const obj = entry as Record<string, unknown>;

	if (typeof obj['ruleId'] !== 'string' || obj['ruleId'] === '') {
		throw new BaselineError(`${at} has no "ruleId" string: ${path}`);
	}

	if (typeof obj['severity'] !== 'string' || !isSeverity(obj['severity'])) {
		throw new BaselineError(`${at} has no valid "severity": ${path}. ` +
			`Expected one of ${SEVERITIES.join(', ')}.`);
	}

	if (typeof obj['title'] !== 'string' || obj['title'] === '') {
		throw new BaselineError(`${at} has no "title" string: ${path}`);
	}

	if (obj['repo'] !== undefined && !isRepoRef(obj['repo'])) {
		throw new BaselineError(`${at} has an invalid "repo" ` +
			`(expected { owner, name } strings): ${path}`);
	}

	if (obj['org'] !== undefined && typeof obj['org'] !== 'string') {
		throw new BaselineError(`${at} has an invalid "org" string: ${path}`);
	}

	return entry as Finding;
}

/**
 * Check that a raw value is a well-formed repository reference.
 *
 * @param raw - The raw `repo` field of a finding.
 * @returns   True when `raw` has string `owner` and `name`.
 */
function isRepoRef(raw: unknown): raw is { owner: string; name: string; } {
	if (typeof raw !== 'object' || raw === null) {
		return false;
	}

	const obj = raw as Record<string, unknown>;

	return typeof obj['owner'] === 'string' && obj['owner'] !== '' &&
		typeof obj['name'] === 'string' && obj['name'] !== '';
}
