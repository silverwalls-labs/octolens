import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/access/webhooks-use-https.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/hooks';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when no webhooks exist', emptyCase);

async function emptyCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(200, []);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports no findings when all webhooks use HTTPS with verification', secureCase);

async function secureCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(200, [
			{
				id: 1,
				config: { url: 'https://example.com/hook', insecure_ssl: '0' },
			},
		]);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when webhooks use plain HTTP or skip SSL verification', insecureCase);

async function insecureCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(200, [
			{
				id: 1,
				config: { url: 'http://example.com/hook', insecure_ssl: '0' },
			},
			{
				id: 2,
				config: { url: 'https://example.com/hook', insecure_ssl: '1' },
			},
			{
				id: 3,
				config: { url: 'https://example.com/hook', insecure_ssl: '0' },
			},
		]);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'access/webhooks-use-https');
	assert.equal(findings[0]?.severity, 'medium');
	assert.match(findings[0]?.detail ?? '', /#1.*plain http/);
	assert.match(findings[0]?.detail ?? '', /#2.*ssl verification disabled/);
	assert.doesNotMatch(findings[0]?.detail ?? '', /#3/);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
