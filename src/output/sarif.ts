import { createHash } from 'node:crypto';
import { compareSeverity } from '../types/severity.ts';
import type {
	Finding, OrgScanReport, RuleRun, ScanResult, Severity,
} from '../types/index.ts';
import { findOrgRuleById, findRuleById } from '../rules/index.ts';
import { readVersion } from '../cli/version.ts';
import { subjectLabel } from './subject.ts';

/** Options for {@link formatSarif}. */
export type SarifOptions = {
	/** Tool version reported as `tool.driver.version`. Defaults to the package version. */
	toolVersion?: string;
};

/** SARIF result / notification level. */
type SarifLevel = 'error' | 'warning' | 'note';

/** Reporting descriptor for one rule (`tool.driver.rules[]`). */
type SarifRule = {
	id: string;
	name: string;
	shortDescription: { text: string; };
	fullDescription: { text: string; };
	helpUri: string;
	help: { text: string; markdown: string; };
	defaultConfiguration: { level: SarifLevel; };
	properties: { 'tags': string[]; 'security-severity': string; };
};

/** A single SARIF result (one finding). */
type SarifResult = {
	ruleId: string;
	ruleIndex: number;
	level: SarifLevel;
	message: { text: string; };
	locations: {
		physicalLocation: {
			artifactLocation: { uri: string; };
			region: { startLine: number; };
		};
	}[];
	partialFingerprints: {
		'primaryLocationLineHash': string;
		'octolensSubject/v1': string;
	};
};

/** A tool execution notification (errored or skipped rule, failed repo). */
type SarifNotification = {
	level: SarifLevel;
	message: { text: string; };
};

/** Invocation record carrying partial-scan fidelity. */
type SarifInvocation = {
	executionSuccessful: boolean;
	toolExecutionNotifications: SarifNotification[];
};

/** Minimal SARIF 2.1.0 log document — only the fields octolens emits. */
type SarifLog = {
	$schema: string;
	version: '2.1.0';
	runs: {
		tool: {
			driver: {
				name: string;
				version: string;
				informationUri: string;
				rules: SarifRule[];
			};
		};
		automationDetails: { id: string; };
		invocations: SarifInvocation[];
		results: SarifResult[];
		columnKind: 'utf16CodeUnits';
	}[];
};

/** A finding paired with its precomputed subject label. */
type Entry = {
	finding: Finding;
	subject: string;
};

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

const HOMEPAGE = 'https://github.com/silverwalls-labs/octolens#readme';

/** SARIF level for each octolens severity. */
const LEVEL_FOR: Record<Severity, SarifLevel> = {
	critical: 'error',
	high: 'error',
	medium: 'warning',
	low: 'note',
	info: 'note',
};

/**
 * GitHub `security-severity` score for each octolens severity, chosen
 * mid-band per GitHub's thresholds: ≥ 9.0 critical, 7.0–8.9 high,
 * 4.0–6.9 medium, < 4.0 low. GitHub has no "info" band, so info
 * findings display as low.
 */
const SECURITY_SEVERITY_FOR: Record<Severity, string> = {
	critical: '9.5',
	high: '8.0',
	medium: '5.5',
	low: '3.0',
	info: '0.0',
};

/**
 * Repository file path reported as the physical location for rules with
 * an obvious file association. Findings carry no file paths of their own
 * (they describe repository / organisation settings), but GitHub code
 * scanning only displays results that have a physical location.
 */
const RULE_FILE_PATHS = new Map<string, string>([
	[ 'access/codeowners-file-present', '.github/CODEOWNERS' ],
	[ 'access/codeowners-valid', '.github/CODEOWNERS' ],
	[ 'repo-config/license-file-present', 'LICENSE' ],
	[ 'security/security-policy-file', 'SECURITY.md' ],
]);

/** Fallback physical location for rules without a natural file. */
const DEFAULT_FILE_PATH = 'README.md';

/**
 * Serialize a scan result or fleet report as a SARIF 2.1.0 document
 * suitable for GitHub code-scanning upload.
 *
 * Emits a single run: findings become `results` (fleet reports are
 * flattened, with the subject prefixed in each message), referenced rules
 * become `tool.driver.rules`, and errored / skipped rule runs surface as
 * invocation notifications. Output is deterministic: results are ordered
 * by severity (descending), rule ID, then subject.
 *
 * @param result  - The scan result or org fleet report to format.
 * @param options - Formatting options.
 * @returns       JSON with 2-space indentation and a trailing newline.
 */
export function formatSarif(
	result: ScanResult | OrgScanReport,
	options: SarifOptions = {},
): string {
	const fleet = isFleetReport(result);
	const entries = collectEntries(result).sort(compareEntries);
	const rules = buildRules(entries);
	const ruleIds = rules.map((rule) => rule.id);

	const log: SarifLog = {
		$schema: SARIF_SCHEMA,
		version: '2.1.0',
		runs: [
			{
				tool: {
					driver: {
						name: 'octolens',
						version: options.toolVersion ?? readVersion(),
						informationUri: HOMEPAGE,
						rules,
					},
				},
				automationDetails: { id: automationId(result) },
				invocations: [ buildInvocation(result) ],
				results: buildResults(entries, ruleIds, fleet),
				columnKind: 'utf16CodeUnits',
			},
		],
	};

	return `${JSON.stringify(log, null, 2)}\n`;
}

/**
 * Flatten the findings of a scan result or fleet report into entries.
 *
 * @param result - Scan result to inspect.
 * @returns      One entry per finding, in input order.
 */
function collectEntries(result: ScanResult | OrgScanReport): Entry[] {
	const findings = isFleetReport(result) ?
		[ ...result.org.findings, ...result.repos.flatMap((repo) => repo.findings) ] :
		result.findings;

	return findings.map((finding) => ({ finding, subject: subjectLabel(finding) }));
}

/**
 * Comparator ordering entries by severity (most severe first), then rule
 * ID, then subject.
 *
 * @param a - First item to compare.
 * @param b - Second item to compare.
 * @returns Negative, zero, or positive per comparator contract.
 */
function compareEntries(a: Entry, b: Entry): number {
	const bySeverity = compareSeverity(a.finding.severity, b.finding.severity);

	if (bySeverity !== 0) {
		return bySeverity;
	}

	const byRule = compareStrings(a.finding.ruleId, b.finding.ruleId);

	if (byRule !== 0) {
		return byRule;
	}

	return compareStrings(a.subject, b.subject);
}

/**
 * Locale-independent string comparator (plain code-unit ordering).
 *
 * `localeCompare` varies with the runtime locale / ICU collation, which
 * would make the emitted byte order environment-dependent.
 *
 * @param a - First string to compare.
 * @param b - Second string to compare.
 * @returns Negative, zero, or positive per comparator contract.
 */
function compareStrings(a: string, b: string): number {
	return a < b ?
		- 1 :
		a > b ?
			1 :
			0;
}

/**
 * Build the rule descriptors for every rule referenced by the entries,
 * sorted by rule ID.
 *
 * Each rule's descriptor is derived from its first entry in severity
 * order, so a rule reported at several severities takes its highest one.
 *
 * @param entries - Entries sorted by {@link compareEntries}.
 * @returns       Deduplicated rule descriptors, sorted by rule ID.
 */
function buildRules(entries: Entry[]): SarifRule[] {
	const representatives = new Map<string, Finding>();

	for (const { finding } of entries) {
		if (!representatives.has(finding.ruleId)) {
			representatives.set(finding.ruleId, finding);
		}
	}

	return [ ...representatives.entries() ]
		.sort(([ a ], [ b ]) => compareStrings(a, b))
		.map(([ id, finding ]) => toRuleDescriptor(id, finding));
}

/**
 * Build the SARIF results for all entries, assigning per-rule indexes
 * and stable fingerprints.
 *
 * Fingerprints combine rule ID, subject, title, and an occurrence index
 * that only counts exact duplicates (same rule, subject, and title).
 * Sibling findings of one rule therefore keep their fingerprints when
 * other siblings are added or removed, so code-scanning alerts survive
 * unrelated changes instead of being closed and reopened.
 *
 * GitHub code scanning consumes only the `primaryLocationLineHash`
 * partial fingerprint; octolens hashes the finding identity into that
 * key so findings sharing a synthetic file location stay distinct.
 * The human-readable `octolensSubject/v1` key is kept for direct
 * SARIF consumers and is ignored by GitHub.
 *
 * @param entries - Entries sorted by {@link compareEntries}.
 * @param ruleIds - Rule IDs in `tool.driver.rules` order.
 * @param fleet   - Whether messages should be prefixed with the subject.
 * @returns       One SARIF result per entry, in entry order.
 */
function buildResults(entries: Entry[], ruleIds: string[], fleet: boolean): SarifResult[] {
	const occurrences = new Map<string, number>();

	return entries.map((entry) => {
		const key = `${entry.finding.ruleId}:${entry.subject}:${entry.finding.title}`;
		const occurrence = occurrences.get(key) ?? 0;

		occurrences.set(key, occurrence + 1);

		return toResult(entry, ruleIds.indexOf(entry.finding.ruleId), occurrence, fleet);
	});
}

/**
 * Build the descriptor for one rule from its representative finding.
 *
 * Descriptions come from the rule registry when the rule is known;
 * otherwise the finding's title is used so unknown rule IDs still
 * produce a valid descriptor.
 *
 * @param id      - Identifier of the rule being described.
 * @param finding - Representative (highest-severity) finding for the rule.
 * @returns       The entry for `tool.driver.rules`.
 */
function toRuleDescriptor(id: string, finding: Finding): SarifRule {
	const metadata = findRuleById(id) ?? findOrgRuleById(id);
	const description = metadata?.summary ?? finding.title;
	const references = finding.references ?? [];
	const helpBase = finding.remediation ?? description;

	return {
		id,
		name: pascalCase(id),
		shortDescription: { text: description },
		fullDescription: { text: description },
		helpUri: references[0]?.url ?? HOMEPAGE,
		help: {
			text: withReferences(helpBase, references.map((ref) => `${ref.name}: ${ref.url}`)),
			markdown: withReferences(
				helpBase,
				references.map((ref) => `- [${ref.name}](${ref.url})`),
			),
		},
		defaultConfiguration: { level: LEVEL_FOR[finding.severity] },
		properties: {
			'tags': metadata ?
				[ ...new Set([ 'security', metadata.category ]) ] :
				[ 'security' ],
			'security-severity': SECURITY_SEVERITY_FOR[finding.severity],
		},
	};
}

/**
 * Append rendered reference lines to a help text.
 *
 * @param base  - Remediation or description text.
 * @param lines - Rendered reference lines, possibly empty.
 * @returns     The combined help text.
 */
function withReferences(base: string, lines: string[]): string {
	return lines.length === 0 ?
		base :
		`${base}\n\n${lines.join('\n')}`;
}

/**
 * Build the SARIF result for one entry.
 *
 * @param entry      - The finding and its subject label.
 * @param ruleIndex  - Index of the rule in `tool.driver.rules`.
 * @param occurrence - 0-based index among exact duplicates (same rule, subject, and title).
 * @param fleet      - Whether to prefix the message with the subject.
 * @returns          The SARIF result.
 */
function toResult(
	entry: Entry,
	ruleIndex: number,
	occurrence: number,
	fleet: boolean,
): SarifResult {
	const { finding, subject } = entry;
	const identity = `${finding.ruleId}:${subject}:${finding.title}:${occurrence}`;
	const body = finding.detail ?
		`${finding.title}\n\n${finding.detail}` :
		finding.title;
	const text = fleet && subject !== '' ?
		`${subject}: ${body}` :
		body;
	const uri = RULE_FILE_PATHS.get(finding.ruleId) ?? DEFAULT_FILE_PATH;

	return {
		ruleId: finding.ruleId,
		ruleIndex,
		level: LEVEL_FOR[finding.severity],
		message: { text },
		locations: [
			{
				physicalLocation: {
					artifactLocation: { uri },
					region: { startLine: 1 },
				},
			},
		],
		partialFingerprints: {
			'primaryLocationLineHash': stableHash(identity),
			'octolensSubject/v1': identity,
		},
	};
}

/**
 * Deterministic hash of a finding identity for the fingerprint that
 * GitHub code scanning consumes.
 *
 * GitHub only reads the `primaryLocationLineHash` partial fingerprint
 * and treats it as an opaque string, so a short digest of the full
 * identity (rule, subject, title, duplicate index) gives every result
 * a stable, unique fingerprint even when several findings share the
 * same synthetic file location.
 *
 * @param value - Identity string to hash.
 * @returns     16-hex-character SHA-256 prefix.
 */
function stableHash(value: string): string {
	return createHash('sha256').update(value).digest('hex')
		.slice(0, 16);
}

/**
 * Build the invocation record: whether every rule ran cleanly, plus one
 * notification per errored rule, skipped rule, and failed repository.
 *
 * A fleet whose repository listing aborted mid-stream is reported as a
 * failed invocation: consumers (and code-scanning alert tracking) must
 * not treat the partial result set as the complete picture, because
 * alerts for missing repositories would be closed as fixed.
 *
 * @param result - Scan result to inspect.
 * @returns      The SARIF invocation.
 */
function buildInvocation(result: ScanResult | OrgScanReport): SarifInvocation {
	const fleet = isFleetReport(result);
	const scans = fleet ?
		[ result.org, ...result.repos ] :
		[ result ];
	const failures = fleet ?
		result.failures :
		[];
	const listingComplete = fleet ?
		result.summary.listingComplete :
		true;

	const notifications: SarifNotification[] = [];

	for (const scan of scans) {
		const subject = fleet ?
			targetLabel(scan) :
			undefined;

		for (const run of scan.runs) {
			if (run.status !== 'ok') {
				notifications.push(toNotification(run, subject));
			}
		}
	}

	for (const failure of failures) {
		const repo = `${failure.repo.owner}/${failure.repo.name}`;

		notifications.push({
			level: 'error',
			message: { text: `${repo}: repository scan failed: ${failure.error}` },
		});
	}

	if (fleet && !result.summary.listingComplete) {
		notifications.push({
			level: 'error',
			message: {
				text: `${result.target.org}: repository listing incomplete: ` +
					'some repositories may be missing from this report',
			},
		});
	}

	const errored = scans.some((scan) => scan.runs.some((run) => run.status === 'error'));

	return {
		executionSuccessful: listingComplete && !errored && failures.length === 0,
		toolExecutionNotifications: notifications,
	};
}

/**
 * Build the notification for an errored or skipped rule run.
 *
 * @param run     - The non-`ok` rule run.
 * @param subject - Subject label prefixed in fleet mode.
 * @returns       The SARIF notification.
 */
function toNotification(run: RuleRun, subject?: string): SarifNotification {
	const prefix = subject ?
		`${subject}: ` :
		'';

	if (run.status === 'error') {
		return {
			level: 'error',
			message: { text: `${prefix}${run.ruleId}: ${run.error ?? 'rule execution failed'}` },
		};
	}

	const reason = run.skipReason ?? 'no reason recorded';

	return {
		level: 'note',
		message: { text: `${prefix}${run.ruleId}: skipped: ${reason}` },
	};
}

/**
 * Automation identifier naming the code-scanning category for this scan.
 *
 * The trailing slash makes the whole identifier the category, so several
 * octolens uploads (or octolens next to other tools) can coexist on one
 * commit.
 *
 * @param result - Scan result to inspect.
 * @returns      The automation details identifier.
 */
function automationId(result: ScanResult | OrgScanReport): string {
	const { target } = result;

	if (target.type === 'repo') {
		return `octolens/repo/${target.owner}/${target.name}/`;
	}
	if (target.type === 'org') {
		return `octolens/org/${target.org}/`;
	}

	return `octolens/org-fleet/${target.org}/`;
}

/**
 * Human-readable label for a scan target: `owner/name` for repositories,
 * the organisation login otherwise.
 *
 * @param scan - Scan result to inspect.
 * @returns    `owner/name` or the organisation login.
 */
function targetLabel(scan: ScanResult): string {
	return scan.target.type === 'repo' ?
		`${scan.target.owner}/${scan.target.name}` :
		scan.target.org;
}

/**
 * PascalCase display name for a rule ID.
 *
 * @param id - Rule ID (e.g. `"repo-config/block-force-push"`).
 * @returns  The display name (e.g. `"RepoConfigBlockForcePush"`).
 */
function pascalCase(id: string): string {
	return id
		.split(/[^a-z0-9]+/iu)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

/**
 * Narrow a scan outcome to the fleet report variant.
 *
 * @param result - Scan result to inspect.
 * @returns      True when the result is a fleet report.
 */
function isFleetReport(result: ScanResult | OrgScanReport): result is OrgScanReport {
	return result.target.type === 'org-fleet';
}
