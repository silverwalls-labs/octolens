import {
	describe, test, afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdtempSync, writeFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	loadBaseline, assertBaselineCompatible, BaselineError,
} from '../../../src/engine/baseline.ts';
import type {
	Finding, ScanResult, OrgScanReport,
} from '../../../src/types/index.ts';

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function tmpFile(name: string, content: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'octolens-baseline-'));

	tempDirs.push(dir);
	const path = join(dir, name);

	writeFileSync(path, content);

	return path;
}

const FINDING: Finding = {
	ruleId: 'repo-config/branch-protection-required',
	severity: 'high',
	repo: { owner: 'sheplu', name: 'editorconfig' },
	title: 'Enable branch protection',
};

const ORG_FINDING: Finding = {
	ruleId: 'org/two-factor-required',
	severity: 'critical',
	org: 'silverwalls-labs',
	title: 'Require 2FA',
};

function makeRepoBaseline(findings: Finding[]): ScanResult {
	return {
		schemaVersion: 1,
		target: {
			type: 'repo', owner: 'sheplu', name: 'editorconfig',
		},
		threshold: 'high',
		runs: [],
		findings,
		summary: {
			rulesRun: 0,
			rulesErrored: 0,
			rulesSkipped: 0,
			findingsTotal: findings.length,
			findingsBySeverity: {
				critical: 0, high: 0, medium: 0, low: 0, info: 0,
			},
		},
	};
}

function makeOrgBaseline(findings: Finding[]): ScanResult {
	return {
		...makeRepoBaseline(findings),
		target: { type: 'org' as const, org: 'silverwalls-labs' },
	};
}

function makeFleetBaseline(
	orgFindings: Finding[],
	repoFindings: Finding[],
): OrgScanReport {
	return {
		schemaVersion: 1,
		target: { type: 'org-fleet', org: 'silverwalls-labs' },
		threshold: 'high',
		org: makeOrgBaseline(orgFindings),
		repos: [ makeRepoBaseline(repoFindings) ],
		skipped: [],
		failures: [],
		summary: {
			reposDiscovered: 1,
			reposScanned: 1,
			reposSkipped: 0,
			reposFailed: 0,
			listingComplete: true,
			rulesRun: 0,
			rulesErrored: 0,
			rulesSkipped: 0,
			findingsTotal: orgFindings.length + repoFindings.length,
			findingsBySeverity: {
				critical: 0, high: 0, medium: 0, low: 0, info: 0,
			},
		},
	};
}

describe('loadBaseline', () => {
	test('loads a valid repo ScanResult', () => {
		const data = makeRepoBaseline([ FINDING ]);
		const path = tmpFile('baseline.json', JSON.stringify(data));
		const baseline = loadBaseline(path);

		assert.equal(baseline.targetType, 'repo');
		assert.equal(baseline.findings.length, 1);
		assert.equal(baseline.findings[0].ruleId, FINDING.ruleId);
	});

	test('loads a valid org ScanResult', () => {
		const data = makeOrgBaseline([ ORG_FINDING ]);
		const path = tmpFile('baseline.json', JSON.stringify(data));
		const baseline = loadBaseline(path);

		assert.equal(baseline.targetType, 'org');
		assert.equal(baseline.findings.length, 1);
	});

	test('loads a valid org-fleet OrgScanReport', () => {
		const data = makeFleetBaseline([ ORG_FINDING ], [ FINDING ]);
		const path = tmpFile('baseline.json', JSON.stringify(data));
		const baseline = loadBaseline(path);

		assert.equal(baseline.targetType, 'org-fleet');
		assert.equal(baseline.findings.length, 2);
	});

	test('fleet baseline with empty repos array', () => {
		const data: OrgScanReport = {
			...makeFleetBaseline([ ORG_FINDING ], []),
			repos: [],
		};
		const path = tmpFile('baseline.json', JSON.stringify(data));
		const baseline = loadBaseline(path);

		assert.equal(baseline.findings.length, 1);
	});

	test('throws on missing file', () => {
		assert.throws(
			() => loadBaseline('/tmp/does-not-exist-octolens-test.json'),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('Cannot read baseline file'),
		);
	});

	test('throws on invalid JSON', () => {
		const path = tmpFile('bad.json', '{ not valid json');

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('not valid JSON'),
		);
	});

	test('throws on a JSON array', () => {
		const path = tmpFile('array.json', '[]');

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('must contain a JSON object'),
		);
	});

	test('throws on missing schemaVersion', () => {
		const path = tmpFile('no-version.json', JSON.stringify({
			target: { type: 'repo' },
			findings: [],
		}));

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('Unsupported baseline schema version'),
		);
	});

	test('throws on wrong schemaVersion', () => {
		const path = tmpFile('v2.json', JSON.stringify({
			schemaVersion: 2,
			target: { type: 'repo' },
			findings: [],
		}));

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('Unsupported baseline schema version: 2'),
		);
	});

	test('throws on missing target', () => {
		const path = tmpFile('no-target.json', JSON.stringify({
			schemaVersion: 1,
			findings: [],
		}));

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('no valid "target" field'),
		);
	});

	test('throws on unknown target type', () => {
		const path = tmpFile('bad-type.json', JSON.stringify({
			schemaVersion: 1,
			target: { type: 'custom' },
			findings: [],
		}));

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('Unknown baseline target type'),
		);
	});

	test('throws when findings array is missing from a repo baseline', () => {
		const path = tmpFile('no-findings.json', JSON.stringify({
			schemaVersion: 1,
			target: {
				type: 'repo', owner: 'a', name: 'b',
			},
		}));

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('no "findings" array'),
		);
	});

	test('throws when fleet baseline has no org field', () => {
		const path = tmpFile('fleet-no-org.json', JSON.stringify({
			schemaVersion: 1,
			target: { type: 'org-fleet', org: 'acme' },
			repos: [],
		}));

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('no valid "org" field'),
		);
	});

	test('throws when fleet baseline org has no findings array', () => {
		const path = tmpFile('fleet-org-no-findings.json', JSON.stringify({
			schemaVersion: 1,
			target: { type: 'org-fleet', org: 'acme' },
			org: { runs: [] },
			repos: [],
		}));

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('"org" has no "findings" array'),
		);
	});

	test('throws when fleet baseline has no repos array', () => {
		const path = tmpFile('fleet-no-repos.json', JSON.stringify({
			schemaVersion: 1,
			target: { type: 'org-fleet', org: 'acme' },
			org: { findings: [] },
		}));

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('no "repos" array'),
		);
	});

	test('throws when fleet baseline contains an invalid repo entry', () => {
		const path = tmpFile('fleet-bad-repo.json', JSON.stringify({
			schemaVersion: 1,
			target: { type: 'org-fleet', org: 'acme' },
			org: { findings: [] },
			repos: [ 'not-an-object' ],
		}));

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('invalid repo entry'),
		);
	});

	test('throws when fleet baseline repo entry has no findings', () => {
		const path = tmpFile('fleet-repo-no-findings.json', JSON.stringify({
			schemaVersion: 1,
			target: { type: 'org-fleet', org: 'acme' },
			org: { findings: [] },
			repos: [ { runs: [] } ],
		}));

		assert.throws(
			() => loadBaseline(path),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('repo entry has no "findings" array'),
		);
	});
});

describe('assertBaselineCompatible', () => {
	test('matching types do not throw', () => {
		const data = makeRepoBaseline([]);
		const path = tmpFile('baseline.json', JSON.stringify(data));
		const baseline = loadBaseline(path);

		assert.doesNotThrow(() => assertBaselineCompatible(baseline, 'repo'));
	});

	test('mismatched types throw with both types in message', () => {
		const data = makeRepoBaseline([]);
		const path = tmpFile('baseline.json', JSON.stringify(data));
		const baseline = loadBaseline(path);

		assert.throws(
			() => assertBaselineCompatible(baseline, 'org-fleet'),
			(err: unknown) => err instanceof BaselineError &&
				err.message.includes('"repo"') &&
				err.message.includes('"org-fleet"'),
		);
	});
});
