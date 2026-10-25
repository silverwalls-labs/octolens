import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	filterRulesByGlob, unmatchedPatterns,
} from '../../../src/engine/rule-filter.ts';

/** Minimal rule stub carrying only an `id`. */
function r(id: string): { id: string; } {
	return { id };
}

const SAMPLE_RULES = [
	r('security/secret-scanning-enabled'),
	r('security/dependabot-alerts-enabled'),
	r('security/code-scanning-enabled'),
	r('repo-config/branch-protection-required'),
	r('repo-config/block-force-push'),
	r('access/admin-count'),
	r('access/codeowners-file-present'),
	r('cicd/actions-allowlist'),
	r('org/two-factor-required'),
	r('org/default-repo-permission'),
];

describe('filterRulesByGlob', () => {
	test('no patterns returns all rules unchanged', () => {
		const result = filterRulesByGlob(SAMPLE_RULES, { only: [], skip: [] });

		assert.equal(result.length, SAMPLE_RULES.length);
		assert.deepEqual(
			result.map((rule) => rule.id),
			SAMPLE_RULES.map((rule) => rule.id),
		);
	});

	test('single --only-rules pattern filters to matching rules', () => {
		const result = filterRulesByGlob(SAMPLE_RULES, {
			only: [ 'security/*' ],
			skip: [],
		});

		assert.deepEqual(result.map((rule) => rule.id), [
			'security/secret-scanning-enabled',
			'security/dependabot-alerts-enabled',
			'security/code-scanning-enabled',
		]);
	});

	test('multiple --only-rules patterns are OR\'d', () => {
		const result = filterRulesByGlob(SAMPLE_RULES, {
			only: [ 'security/*', 'org/*' ],
			skip: [],
		});

		assert.deepEqual(result.map((rule) => rule.id), [
			'security/secret-scanning-enabled',
			'security/dependabot-alerts-enabled',
			'security/code-scanning-enabled',
			'org/two-factor-required',
			'org/default-repo-permission',
		]);
	});

	test('single --skip-rules pattern excludes matching rules', () => {
		const result = filterRulesByGlob(SAMPLE_RULES, {
			only: [],
			skip: [ 'repo-config/*' ],
		});

		assert.equal(
			result.some((rule) => rule.id.startsWith('repo-config/')),
			false,
		);
		assert.equal(result.length, SAMPLE_RULES.length - 2);
	});

	test('multiple --skip-rules patterns are OR\'d', () => {
		const result = filterRulesByGlob(SAMPLE_RULES, {
			only: [],
			skip: [ 'org/*', 'cicd/*' ],
		});

		assert.equal(
			result.some((rule) => rule.id.startsWith('org/')),
			false,
		);
		assert.equal(
			result.some((rule) => rule.id.startsWith('cicd/')),
			false,
		);
		assert.equal(result.length, SAMPLE_RULES.length - 3);
	});

	test('--only-rules narrows first, then --skip-rules excludes', () => {
		const result = filterRulesByGlob(SAMPLE_RULES, {
			only: [ 'security/*' ],
			skip: [ '*/dependabot-*' ],
		});

		assert.deepEqual(result.map((rule) => rule.id), [
			'security/secret-scanning-enabled',
			'security/code-scanning-enabled',
		]);
	});

	test('all rules excluded returns empty array', () => {
		const result = filterRulesByGlob(SAMPLE_RULES, {
			only: [ 'security/*' ],
			skip: [ 'security/*' ],
		});

		assert.deepEqual(result, []);
	});

	test('pattern matching by rule name across categories', () => {
		const result = filterRulesByGlob(SAMPLE_RULES, {
			only: [ '*/*-scanning-*' ],
			skip: [],
		});

		assert.deepEqual(result.map((rule) => rule.id), [
			'security/secret-scanning-enabled',
			'security/code-scanning-enabled',
		]);
	});

	test('exact rule ID works as a pattern', () => {
		const result = filterRulesByGlob(SAMPLE_RULES, {
			only: [ 'access/admin-count' ],
			skip: [],
		});

		assert.deepEqual(result.map((rule) => rule.id), [ 'access/admin-count' ]);
	});

	test('preserves original order', () => {
		const result = filterRulesByGlob(SAMPLE_RULES, {
			only: [ 'org/*', 'security/*' ],
			skip: [],
		});

		const ids = result.map((rule) => rule.id);

		// security rules come first in SAMPLE_RULES, then org rules.
		assert.equal(ids.indexOf('security/secret-scanning-enabled') <
			ids.indexOf('org/two-factor-required'), true);
	});

	test('does not mutate the input array', () => {
		const copy = [ ...SAMPLE_RULES ];

		filterRulesByGlob(SAMPLE_RULES, {
			only: [ 'security/*' ],
			skip: [],
		});

		assert.deepEqual(
			SAMPLE_RULES.map((rule) => rule.id),
			copy.map((rule) => rule.id),
		);
	});
});

describe('unmatchedPatterns', () => {
	const KNOWN_IDS = SAMPLE_RULES.map((rule) => rule.id);

	test('returns empty when all patterns match something', () => {
		const result = unmatchedPatterns(KNOWN_IDS, [ 'security/*', 'org/*' ]);

		assert.deepEqual(result, []);
	});

	test('returns patterns that matched zero IDs', () => {
		const result = unmatchedPatterns(
			KNOWN_IDS,
			[
				'security/*',
				'nonexistent/*',
				'*/bogus-rule',
			],
		);

		assert.deepEqual(result, [ 'nonexistent/*', '*/bogus-rule' ]);
	});

	test('returns empty for empty patterns', () => {
		const result = unmatchedPatterns(KNOWN_IDS, []);

		assert.deepEqual(result, []);
	});

	test('exact ID counts as a match', () => {
		const result = unmatchedPatterns(KNOWN_IDS, [ 'access/admin-count' ]);

		assert.deepEqual(result, []);
	});
});
