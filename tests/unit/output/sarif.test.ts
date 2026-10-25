import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSarif } from '../../../src/output/sarif.ts';
import { readVersion } from '../../../src/cli/version.ts';
import type {
	Finding, OrgScanReport, RuleRun, ScanResult, Severity,
} from '../../../src/types/index.ts';

const ORG = 'acme';

const REPO = { owner: 'silverwalls-labs', name: 'review' };

const BASE_FINDING: Finding = {
	ruleId: 'repo-config/branch-protection-required',
	severity: 'critical',
	repo: REPO,
	title: 'Default branch is not protected',
	detail: 'The default branch has no protection rule.',
	remediation: 'Add a branch protection rule for the default branch.',
	references: [
		{
			name: 'About protected branches',
			url: 'https://docs.github.com/protected-branches',
		},
	],
};

type SarifRule = {
	id: string;
	name: string;
	shortDescription: { text: string; };
	fullDescription: { text: string; };
	helpUri: string;
	help: { text: string; markdown: string; };
	defaultConfiguration: { level: string; };
	properties: { 'tags': string[]; 'security-severity': string; };
};

type SarifResult = {
	ruleId: string;
	ruleIndex: number;
	level: string;
	message: { text: string; };
	locations: {
		physicalLocation: {
			artifactLocation: { uri: string; };
			region: { startLine: number; };
		};
	}[];
	partialFingerprints: { 'octolensSubject/v1': string; };
};

type SarifNotification = {
	level: string;
	message: { text: string; };
};

type SarifRun = {
	tool: {
		driver: {
			name: string;
			version: string;
			informationUri: string;
			rules: SarifRule[];
		};
	};
	automationDetails: { id: string; };
	invocations: {
		executionSuccessful: boolean;
		toolExecutionNotifications: SarifNotification[];
	}[];
	results: SarifResult[];
	columnKind: string;
};

type SarifLog = {
	$schema: string;
	version: string;
	runs: SarifRun[];
};

describe('formatSarif', () => {
	test('emits the SARIF 2.1.0 envelope with a single run', () => {
		const raw = formatSarif(makeResult([ BASE_FINDING ]), { toolVersion: '1.2.3' });

		assert.ok(raw.endsWith('\n'));

		const doc = JSON.parse(raw) as SarifLog;

		assert.equal(doc.$schema, 'https://json.schemastore.org/sarif-2.1.0.json');
		assert.equal(doc.version, '2.1.0');
		assert.equal(doc.runs.length, 1);
		assert.equal(doc.runs[0].columnKind, 'utf16CodeUnits');
	});

	test('reports the tool driver with the package version by default', () => {
		const doc = JSON.parse(formatSarif(makeResult([]))) as SarifLog;
		const driver = doc.runs[0].tool.driver;

		assert.equal(driver.name, 'octolens');
		assert.equal(driver.version, readVersion());
		assert.match(driver.informationUri, /octolens/u);
	});

	test('honours the toolVersion option', () => {
		const run = firstRun(makeResult([]));

		assert.equal(run.tool.driver.version, '9.9.9');
	});

	test('maps severities onto SARIF levels and security-severity scores', () => {
		const severities: Severity[] = [
			'critical',
			'high',
			'medium',
			'low',
			'info',
		];
		const findings = severities.map((severity) => makeFinding({
			severity,
			ruleId: `custom/rule-${severity}`,
		}));
		const run = firstRun(makeResult(findings));

		const levels = Object.fromEntries(run.results.map((r) => [ r.ruleId, r.level ]));

		assert.deepEqual(levels, {
			'custom/rule-critical': 'error',
			'custom/rule-high': 'error',
			'custom/rule-medium': 'warning',
			'custom/rule-low': 'note',
			'custom/rule-info': 'note',
		});

		const scorePairs = run.tool.driver.rules
			.map((r) => [ r.id, r.properties['security-severity'] ]);
		const scores = Object.fromEntries(scorePairs);

		assert.deepEqual(scores, {
			'custom/rule-critical': '9.5',
			'custom/rule-high': '8.0',
			'custom/rule-medium': '5.5',
			'custom/rule-low': '3.0',
			'custom/rule-info': '0.0',
		});
	});

	test('describes known repo and org rules from the registry', () => {
		const orgFinding = makeFinding({
			ruleId: 'org/two-factor-required',
			severity: 'high',
			repo: undefined,
			org: ORG,
			title: 'Two-factor authentication is not required',
		});
		const run = firstRun(makeResult([ BASE_FINDING, orgFinding ]));
		const rules = Object.fromEntries(run.tool.driver.rules.map((r) => [ r.id, r ]));
		const repoRule = rules['repo-config/branch-protection-required'];
		const orgRule = rules['org/two-factor-required'];

		assert.equal(repoRule.name, 'RepoConfigBranchProtectionRequired');
		assert.match(repoRule.shortDescription.text, /protection rule/u);
		assert.equal(repoRule.fullDescription.text, repoRule.shortDescription.text);
		assert.deepEqual(repoRule.properties.tags, [ 'security', 'repo-config' ]);

		assert.match(orgRule.shortDescription.text, /two-factor/iu);
		assert.deepEqual(orgRule.properties.tags, [ 'security', 'org' ]);
	});

	test('does not duplicate the security tag for security-category rules', () => {
		const finding = makeFinding({ ruleId: 'security/secret-scanning-enabled' });
		const rule = firstRun(makeResult([ finding ])).tool.driver.rules[0];

		assert.deepEqual(rule.properties.tags, [ 'security' ]);
	});

	test('falls back to the finding title for unknown rule IDs', () => {
		const finding = makeFinding({
			ruleId: 'custom/unknown-rule',
			title: 'Something odd',
		});
		const rule = firstRun(makeResult([ finding ])).tool.driver.rules[0];

		assert.equal(rule.id, 'custom/unknown-rule');
		assert.equal(rule.name, 'CustomUnknownRule');
		assert.equal(rule.shortDescription.text, 'Something odd');
		assert.deepEqual(rule.properties.tags, [ 'security' ]);
	});

	test('builds help from remediation and references', () => {
		const rule = firstRun(makeResult([ BASE_FINDING ])).tool.driver.rules[0];

		assert.equal(rule.helpUri, 'https://docs.github.com/protected-branches');
		assert.equal(
			rule.help.text,
			'Add a branch protection rule for the default branch.\n\n' +
			'About protected branches: https://docs.github.com/protected-branches',
		);
		assert.equal(
			rule.help.markdown,
			'Add a branch protection rule for the default branch.\n\n' +
			'- [About protected branches](https://docs.github.com/protected-branches)',
		);
	});

	test('falls back to the description when remediation and references are absent', () => {
		const finding = makeFinding({
			ruleId: 'custom/no-extras',
			title: 'Bare finding',
			detail: undefined,
			remediation: undefined,
			references: undefined,
		});
		const rule = firstRun(makeResult([ finding ])).tool.driver.rules[0];

		assert.equal(rule.helpUri, 'https://github.com/silverwalls-labs/octolens#readme');
		assert.equal(rule.help.text, 'Bare finding');
		assert.equal(rule.help.markdown, 'Bare finding');
	});

	test('renders the message from title and optional detail', () => {
		const withDetail = makeFinding({});
		const withoutDetail = makeFinding({
			ruleId: 'custom/terse',
			title: 'Just a title',
			detail: undefined,
		});
		const run = firstRun(makeResult([ withDetail, withoutDetail ]));
		const texts = run.results.map((r) => r.message.text);

		const detailed = 'Default branch is not protected\n\n' +
			'The default branch has no protection rule.';

		assert.ok(texts.includes(detailed));
		assert.ok(texts.includes('Just a title'));
	});

	test('maps file-associated rules to real paths and the rest to README.md', () => {
		const expected: Record<string, string> = {
			'access/codeowners-file-present': '.github/CODEOWNERS',
			'access/codeowners-valid': '.github/CODEOWNERS',
			'repo-config/license-file-present': 'LICENSE',
			'security/security-policy-file': 'SECURITY.md',
			'repo-config/branch-protection-required': 'README.md',
		};
		const findings = Object.keys(expected).map((ruleId) => makeFinding({ ruleId }));
		const run = firstRun(makeResult(findings));

		assert.equal(run.results.length, 5);
		for (const result of run.results) {
			assert.equal(result.locations.length, 1);

			const location = result.locations[0].physicalLocation;

			assert.equal(location.artifactLocation.uri, expected[result.ruleId]);
			assert.equal(location.region.startLine, 1);
		}
	});

	test('deduplicates rules, sorts them by ID, and indexes results', () => {
		const findings = [
			makeFinding({ ruleId: 'security/secret-scanning-enabled', severity: 'high' }),
			makeFinding({ ruleId: 'access/admin-count', severity: 'medium' }),
			makeFinding({
				ruleId: 'security/secret-scanning-enabled',
				severity: 'high',
				title: 'Another secret-scanning finding',
			}),
		];
		const run = firstRun(makeResult(findings));

		assert.deepEqual(
			run.tool.driver.rules.map((r) => r.id),
			[ 'access/admin-count', 'security/secret-scanning-enabled' ],
		);
		assert.equal(run.results.length, 3);
		for (const result of run.results) {
			assert.equal(run.tool.driver.rules[result.ruleIndex].id, result.ruleId);
		}
	});

	test('derives rule severity from its highest-severity finding', () => {
		const findings = [
			makeFinding({ ruleId: 'custom/mixed', severity: 'low' }),
			makeFinding({ ruleId: 'custom/mixed', severity: 'critical' }),
		];
		const rule = firstRun(makeResult(findings)).tool.driver.rules[0];

		assert.equal(rule.defaultConfiguration.level, 'error');
		assert.equal(rule.properties['security-severity'], '9.5');
	});

	test('orders results by severity, rule ID, then subject', () => {
		const findings = [
			makeFinding({
				ruleId: 'b/rule',
				severity: 'medium',
				repo: { owner: ORG, name: 'zeta' },
			}),
			makeFinding({ ruleId: 'z/rule', severity: 'critical' }),
			makeFinding({ ruleId: 'a/rule', severity: 'medium' }),
			makeFinding({
				ruleId: 'b/rule',
				severity: 'medium',
				repo: { owner: ORG, name: 'alpha' },
			}),
		];
		const run = firstRun(makeResult(findings));

		assert.deepEqual(
			run.results.map((r) => r.partialFingerprints['octolensSubject/v1']),
			[
				'z/rule:silverwalls-labs/review:0',
				'a/rule:silverwalls-labs/review:0',
				'b/rule:acme/alpha:0',
				'b/rule:acme/zeta:0',
			],
		);
	});

	test('numbers fingerprints per rule and subject', () => {
		const findings = [
			makeFinding({ ruleId: 'access/webhooks-use-https', severity: 'medium' }),
			makeFinding({
				ruleId: 'access/webhooks-use-https',
				severity: 'medium',
				title: 'Second webhook',
			}),
		];
		const run = firstRun(makeResult(findings));

		assert.deepEqual(
			run.results.map((r) => r.partialFingerprints['octolensSubject/v1']),
			[
				'access/webhooks-use-https:silverwalls-labs/review:0',
				'access/webhooks-use-https:silverwalls-labs/review:1',
			],
		);
	});

	test('flattens a fleet report into one subject-prefixed run', () => {
		const run = firstRun(makeReport());

		assert.equal(run.results.length, 3);

		const texts = run.results.map((r) => r.message.text);

		assert.ok(texts.some((t) => t.startsWith('acme: ')));
		assert.ok(texts.some((t) => t.startsWith('acme/alpha: ')));
		assert.ok(texts.some((t) => t.startsWith('acme/beta: ')));
		assert.deepEqual(
			run.tool.driver.rules.map((r) => r.id),
			[ 'org/two-factor-required', 'repo-config/branch-protection-required' ],
		);
	});

	test('names the code-scanning category after the target', () => {
		assert.equal(
			firstRun(makeResult([])).automationDetails.id,
			'octolens/repo/silverwalls-labs/review/',
		);
		assert.equal(
			firstRun(makeOrgResult([])).automationDetails.id,
			'octolens/org/acme/',
		);
		assert.equal(
			firstRun(makeReport()).automationDetails.id,
			'octolens/org-fleet/acme/',
		);
	});

	test('reports a clean invocation when every rule ran', () => {
		const runs: RuleRun[] = [
			{
				ruleId: 'repo-config/branch-protection-required',
				status: 'ok',
				findings: [],
				durationMs: 1,
			},
		];
		const invocation = firstRun(makeResult([], runs)).invocations[0];

		assert.equal(invocation.executionSuccessful, true);
		assert.deepEqual(invocation.toolExecutionNotifications, []);
	});

	test('surfaces errored and skipped rules as notifications', () => {
		const runs: RuleRun[] = [
			{
				ruleId: 'security/code-scanning-enabled',
				status: 'error',
				findings: [],
				error: 'boom',
				durationMs: 1,
			},
			{
				ruleId: 'access/admin-count',
				status: 'skipped',
				findings: [],
				skipReason: 'needs admin access',
				durationMs: 1,
			},
			{
				ruleId: 'repo-config/branch-protection-required',
				status: 'ok',
				findings: [],
				durationMs: 1,
			},
		];
		const invocation = firstRun(makeResult([], runs)).invocations[0];

		assert.equal(invocation.executionSuccessful, false);
		assert.deepEqual(invocation.toolExecutionNotifications, [
			{
				level: 'error',
				message: { text: 'security/code-scanning-enabled: boom' },
			},
			{
				level: 'note',
				message: { text: 'access/admin-count: skipped: needs admin access' },
			},
		]);
	});

	test('falls back to generic notification text when details are missing', () => {
		const runs: RuleRun[] = [
			{
				ruleId: 'custom/broken', status: 'error', findings: [], durationMs: 1,
			},
			{
				ruleId: 'custom/withheld', status: 'skipped', findings: [], durationMs: 1,
			},
		];
		const invocation = firstRun(makeResult([], runs)).invocations[0];

		assert.deepEqual(invocation.toolExecutionNotifications, [
			{
				level: 'error',
				message: { text: 'custom/broken: rule execution failed' },
			},
			{
				level: 'note',
				message: { text: 'custom/withheld: skipped: no reason recorded' },
			},
		]);
	});

	test('prefixes fleet notifications and reports failed repositories', () => {
		const skippedRun: RuleRun = {
			ruleId: 'access/admin-count',
			status: 'skipped',
			findings: [],
			skipReason: 'needs admin access',
			durationMs: 1,
		};
		const report = makeReport({
			repos: [ makeRepoResult('alpha', [], [ skippedRun ]) ],
			failures: [
				{
					repo: { owner: ORG, name: 'broken' },
					error: 'boom',
				},
			],
		});
		const invocation = firstRun(report).invocations[0];

		assert.equal(invocation.executionSuccessful, false);
		assert.deepEqual(invocation.toolExecutionNotifications, [
			{
				level: 'note',
				message: { text: 'acme/alpha: access/admin-count: skipped: needs admin access' },
			},
			{
				level: 'error',
				message: { text: 'acme/broken: repository scan failed: boom' },
			},
		]);
	});

	test('renders an empty scan as a valid document with no results', () => {
		const run = firstRun(makeResult([]));

		assert.deepEqual(run.tool.driver.rules, []);
		assert.deepEqual(run.results, []);
		assert.equal(run.invocations[0].executionSuccessful, true);
	});

	test('handles findings without a subject and never leaks undefined', () => {
		const orphan: Finding = {
			ruleId: 'custom/mystery',
			severity: 'info',
			title: 'Strange finding',
		};
		const report = makeReport({
			org: makeOrgResult([ orphan ]),
			repos: [],
		});
		const raw = formatSarif(report, { toolVersion: '9.9.9' });

		assert.doesNotMatch(raw, /\bundefined\b/u);

		const run = (JSON.parse(raw) as SarifLog).runs[0];

		assert.equal(run.results[0].message.text, 'Strange finding');
		assert.equal(
			run.results[0].partialFingerprints['octolensSubject/v1'],
			'custom/mystery::0',
		);
	});
});

function firstRun(result: ScanResult | OrgScanReport): SarifRun {
	const doc = JSON.parse(formatSarif(result, { toolVersion: '9.9.9' })) as SarifLog;

	return doc.runs[0];
}

function makeFinding(overrides: Partial<Finding>): Finding {
	return { ...BASE_FINDING, ...overrides };
}

function makeResult(findings: Finding[], runs: RuleRun[] = []): ScanResult {
	return {
		schemaVersion: 1,
		target: {
			type: 'repo', owner: REPO.owner, name: REPO.name,
		},
		threshold: 'info',
		runs,
		findings,
		summary: makeSummary(findings),
	};
}

function makeOrgResult(findings: Finding[], runs: RuleRun[] = []): ScanResult {
	return {
		schemaVersion: 1,
		target: { type: 'org', org: ORG },
		threshold: 'info',
		runs,
		findings,
		summary: makeSummary(findings),
	};
}

function makeRepoResult(name: string, findings: Finding[], runs: RuleRun[] = []): ScanResult {
	return {
		schemaVersion: 1,
		target: {
			type: 'repo', owner: ORG, name,
		},
		threshold: 'info',
		runs,
		findings,
		summary: makeSummary(findings),
	};
}

function makeReport(overrides: Partial<OrgScanReport> = {}): OrgScanReport {
	const orgFinding = makeFinding({
		ruleId: 'org/two-factor-required',
		severity: 'critical',
		repo: undefined,
		org: ORG,
		title: 'Two-factor authentication is not required',
	});
	const alphaFinding = makeFinding({
		severity: 'high',
		repo: { owner: ORG, name: 'alpha' },
	});
	const betaFinding = makeFinding({
		severity: 'high',
		repo: { owner: ORG, name: 'beta' },
	});

	return {
		schemaVersion: 1,
		target: { type: 'org-fleet', org: ORG },
		threshold: 'info',
		org: makeOrgResult([ orgFinding ]),
		repos: [
			makeRepoResult('alpha', [ alphaFinding ]),
			makeRepoResult('beta', [ betaFinding ]),
		],
		skipped: [],
		failures: [],
		summary: {
			reposDiscovered: 2,
			reposScanned: 2,
			reposSkipped: 0,
			reposFailed: 0,
			listingComplete: true,
			rulesRun: 3,
			rulesErrored: 0,
			rulesSkipped: 0,
			findingsTotal: 3,
			findingsBySeverity: {
				critical: 1,
				high: 2,
				medium: 0,
				low: 0,
				info: 0,
			},
		},
		...overrides,
	};
}

function makeSummary(findings: Finding[]): ScanResult['summary'] {
	const findingsBySeverity: Record<Severity, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		info: 0,
	};

	for (const f of findings) {
		findingsBySeverity[f.severity]++;
	}

	return {
		rulesRun: 1,
		rulesErrored: 0,
		rulesSkipped: 0,
		findingsTotal: findings.length,
		findingsBySeverity,
	};
}
