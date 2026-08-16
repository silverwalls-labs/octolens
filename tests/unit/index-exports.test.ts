import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../src/index.ts';

const FUNCTION_EXPORTS = [
	'isSeverity',
	'compareSeverity',
	'meetsThreshold',
	'RuleSkipped',
	'skip',
	'scanRepo',
	'scanOrg',
	'scanOrgAllRepos',
	'repoFilterReason',
	'runRule',
	'exitCodeFor',
	'exitCodeForReport',
	'createLogger',
	'createOctokit',
	'resolveAuth',
	'AuthError',
	'createCachedFetcher',
	'createScopedCache',
	'createRateBudget',
	'findRuleById',
	'findOrgRuleById',
	'formatJson',
	'formatPretty',
	'formatPrettyReport',
	'formatMarkdown',
	'formatMarkdownReport',
] as const;

test('the public barrel exposes every runtime function', functionSurface);

function functionSurface() {
	for (const name of FUNCTION_EXPORTS) {
		assert.equal(typeof api[name], 'function', `expected ${name} to be a function`);
	}
}

test('the public barrel exposes the rule and severity collections', collectionSurface);

function collectionSurface() {
	assert.ok(Array.isArray(api.SEVERITIES));
	assert.ok(api.SEVERITIES.length > 0);
	assert.ok(Array.isArray(api.allRules));
	assert.ok(api.allRules.length >= 40);
	assert.ok(Array.isArray(api.allOrgRules));
	assert.ok(api.allOrgRules.length >= 20);
}
