import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRule } from '../../../src/engine/run-rule.ts';
import { RuleSkipped } from '../../../src/types/index.ts';
import type { Rule, RuleContext } from '../../../src/types/index.ts';

const dummyContext = {} as RuleContext;

function fakeRule(check: Rule['check']): Rule {
	return {
		id: 'test/fake',
		category: 'repo-config',
		defaultSeverity: 'medium',
		summary: 'fake rule for testing',
		docs: 'test/fake',
		check,
	};
}

test('records status ok when rule returns findings', okCase);

async function okCase() {
	const finding = {
		ruleId: 'test/fake',
		severity: 'medium' as const,
		repo: { owner: 'o', name: 'r' },
		title: 'test finding',
	};
	const rule = fakeRule(async () => [ finding ]);

	const run = await runRule(rule, dummyContext);

	assert.equal(run.status, 'ok');
	assert.equal(run.findings.length, 1);
	assert.equal(run.findings[0]?.title, 'test finding');
	assert.equal(run.ruleId, 'test/fake');
	assert.equal(typeof run.durationMs, 'number');
	assert.ok(run.durationMs >= 0);
}

test('records status ok with empty findings on clean pass', emptyCase);

async function emptyCase() {
	const rule = fakeRule(async () => []);

	const run = await runRule(rule, dummyContext);

	assert.equal(run.status, 'ok');
	assert.equal(run.findings.length, 0);
}

test('records status skipped when rule throws RuleSkipped', skippedCase);

async function skippedCase() {
	const rule = fakeRule(throwsSkipped);

	const run = await runRule(rule, dummyContext);

	assert.equal(run.status, 'skipped');
	assert.equal(run.skipReason, 'not available');
	assert.equal(run.findings.length, 0);
}

test('records status error when rule throws a generic Error', errorCase);

async function errorCase() {
	const rule = fakeRule(throwsError);

	const run = await runRule(rule, dummyContext);

	assert.equal(run.status, 'error');
	assert.equal(run.error, 'Internal Server Error');
	assert.equal(run.findings.length, 0);
}

test('records status error when rule throws a non-Error value', nonErrorCase);

async function nonErrorCase() {
	const rule = fakeRule(throwsString);

	const run = await runRule(rule, dummyContext);

	assert.equal(run.status, 'error');
	assert.equal(run.error, 'string error');
	assert.equal(run.findings.length, 0);
}

async function throwsSkipped(): Promise<never> {
	throw new RuleSkipped('not available');
}

async function throwsError(): Promise<never> {
	throw new Error('Internal Server Error');
}

async function throwsString(): Promise<never> {
	throw 'string error';
}
