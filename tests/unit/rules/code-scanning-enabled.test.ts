import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/security/code-scanning-enabled.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when at least one analysis exists', analysisExistsCase);

async function analysisExistsCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/code-scanning/analyses')
		.query(true)
		.reply(200, [ { id: 1, ref: 'refs/heads/main' } ]);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when no analyses exist (empty list)', noAnalysesCase);

async function noAnalysesCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/code-scanning/analyses')
		.query(true)
		.reply(200, []);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'security/code-scanning-enabled');
	assert.equal(findings[0]?.severity, 'high');
}

test('reports a finding when code scanning is unavailable (404)', notFoundCase);

async function notFoundCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/code-scanning/analyses')
		.query(true)
		.reply(404, { message: 'no analysis found' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
}

test('reports a finding when code scanning endpoint returns 403', permissionDeniedCase);

async function permissionDeniedCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/code-scanning/analyses')
		.query(true)
		.reply(403, { message: 'Resource not accessible by integration' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/code-scanning/analyses')
		.query({ per_page: '1' })
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
