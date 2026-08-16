import fc from 'fast-check';
import { SEVERITIES } from '../../src/types/index.ts';
import type {
	Finding,
	OrgScanReport,
	RuleRun,
	ScanResult,
	Severity,
} from '../../src/types/index.ts';

/**
 * Deterministic default seed so CI runs are reproducible; set FUZZ_SEED to
 * explore new inputs and FUZZ_ITERS to change the run count.
 */
const DEFAULT_SEED = 0xC0FFEE;

export const fuzzParams = {
	numRuns: readNumber('FUZZ_ITERS', 250),
	seed: readNumber('FUZZ_SEED', DEFAULT_SEED),
};

function readNumber(name: string, fallback: number): number {
	const parsed = Number(process.env[name]);

	return Number.isFinite(parsed) ?
		parsed :
		fallback;
}

/** Short text including empty strings and multi-byte graphemes. */
export const arbText = fc.oneof(
	fc.string({ maxLength: 8 }),
	fc.string({ unit: 'grapheme', maxLength: 8 }),
);

export const arbSeverity: fc.Arbitrary<Severity> = fc.constantFrom(...SEVERITIES);

export const arbRepoRef = fc.record(
	{ owner: arbText, name: arbText },
	{ noNullPrototype: true },
);

export const arbFinding = fc.record({
	ruleId: arbText,
	severity: arbSeverity,
	title: arbText,
	repo: arbRepoRef,
	org: arbText,
	detail: arbText,
	remediation: arbText,
	references: fc.array(
		fc.record({ name: arbText, url: arbText }, { noNullPrototype: true }),
		{ maxLength: 2 },
	),
}, {
	requiredKeys: [
		'ruleId',
		'severity',
		'title',
	],
	noNullPrototype: true,
}) as fc.Arbitrary<Finding>;

const arbRuleRun = fc.record({
	ruleId: arbText,
	status: fc.constantFrom('ok', 'error', 'skipped'),
	findings: fc.array(arbFinding, { maxLength: 2 }),
	error: arbText,
	skipReason: arbText,
	durationMs: fc.nat({ max: 1_000_000 }),
}, {
	requiredKeys: [
		'ruleId',
		'status',
		'findings',
		'durationMs',
	],
	noNullPrototype: true,
}) as fc.Arbitrary<RuleRun>;

const arbBySeverity = fc.record({
	critical: fc.nat({ max: 99 }),
	high: fc.nat({ max: 99 }),
	medium: fc.nat({ max: 99 }),
	low: fc.nat({ max: 99 }),
	info: fc.nat({ max: 99 }),
}, { noNullPrototype: true });

const arbScanSummary = fc.record({
	rulesRun: fc.nat({ max: 99 }),
	rulesErrored: fc.nat({ max: 99 }),
	rulesSkipped: fc.nat({ max: 99 }),
	findingsTotal: fc.nat({ max: 99 }),
	findingsBySeverity: arbBySeverity,
}, { noNullPrototype: true });

const arbTarget = fc.oneof(
	fc.record({
		type: fc.constant('repo' as const),
		owner: arbText,
		name: arbText,
	}, { noNullPrototype: true }),
	fc.record({ type: fc.constant('org' as const), org: arbText }, { noNullPrototype: true }),
);

export const arbScanResult = fc.record({
	schemaVersion: fc.constant(1 as const),
	target: arbTarget,
	threshold: arbSeverity,
	runs: fc.array(arbRuleRun, { maxLength: 4 }),
	findings: fc.array(arbFinding, { maxLength: 4 }),
	summary: arbScanSummary,
}, { noNullPrototype: true }) as fc.Arbitrary<ScanResult>;

const arbFleetSummary = fc.record({
	reposDiscovered: fc.nat({ max: 99 }),
	reposScanned: fc.nat({ max: 99 }),
	reposSkipped: fc.nat({ max: 99 }),
	reposFailed: fc.nat({ max: 99 }),
	listingComplete: fc.boolean(),
	rulesRun: fc.nat({ max: 99 }),
	rulesErrored: fc.nat({ max: 99 }),
	rulesSkipped: fc.nat({ max: 99 }),
	findingsTotal: fc.nat({ max: 99 }),
	findingsBySeverity: arbBySeverity,
}, { noNullPrototype: true });

export const arbOrgScanReport = fc.record({
	schemaVersion: fc.constant(1 as const),
	target: fc.record(
		{ type: fc.constant('org-fleet' as const), org: arbText },
		{ noNullPrototype: true },
	),
	threshold: arbSeverity,
	org: arbScanResult,
	repos: fc.array(arbScanResult, { maxLength: 3 }),
	skipped: fc.array(fc.record({
		repo: arbRepoRef,
		reason: fc.constantFrom('archived', 'fork', 'ignored'),
	}, { noNullPrototype: true }), { maxLength: 3 }),
	failures: fc.array(
		fc.record({ repo: arbRepoRef, error: arbText }, { noNullPrototype: true }),
		{ maxLength: 3 },
	),
	summary: arbFleetSummary,
}, { noNullPrototype: true }) as fc.Arbitrary<OrgScanReport>;

const FLAG_TOKENS = [
	'scan',
	'--repo',
	'--org',
	'--all-repos',
	'--concurrency',
	'--token',
	'--format',
	'--out',
	'--severity',
	'--verbose',
	'--include-archived',
	'--fail-on-skip',
	'--allow-public',
	'--allow-internal',
	'-h',
	'--help',
	'-v',
	'--version',
];

const VALUE_TOKENS = [
	'sheplu/Octolens',
	'acme',
	'a/b',
	'owner/',
	'/name',
	'json',
	'md',
	'pretty',
	'csv',
	'critical',
	'high',
	'info',
	'meh',
	'1',
	'4',
	'32',
	'33',
	'0',
	'-1',
	'',
];

/** Random argv token streams mixing valid flags, valid values, and junk. */
export const arbArgv = fc.array(
	fc.oneof(
		fc.constantFrom(...FLAG_TOKENS),
		fc.constantFrom(...VALUE_TOKENS),
		fc.string({ maxLength: 6 }),
	),
	{ maxLength: 8 },
);
