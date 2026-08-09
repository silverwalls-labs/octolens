import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/access/codeowners-valid.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when CODEOWNERS has zero errors', noErrorsCase);

async function noErrorsCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/codeowners/errors')
		.reply(200, { errors: [] });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when CODEOWNERS has errors', errorsCase);

async function errorsCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/codeowners/errors')
		.reply(200, {
			errors: [
				{
					line: 5,
					column: 1,
					kind: 'Unknown owner',
					source: '* @nobody',
					suggestion: null,
					message: 'Unknown user',
					path: 'CODEOWNERS',
				},
				{
					line: 8,
					column: 1,
					kind: 'Unknown owner',
					source: '/src/ @ghost',
					suggestion: null,
					message: 'Unknown user',
					path: 'CODEOWNERS',
				},
			],
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'access/codeowners-valid');
	assert.equal(findings[0]?.severity, 'high');
	assert.match(findings[0]?.title ?? '', /2 error/);
}

test('does not fire when CODEOWNERS is missing (404)', notFoundCase);

async function notFoundCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/codeowners/errors')
		.reply(404, { message: 'No CODEOWNERS file' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}
