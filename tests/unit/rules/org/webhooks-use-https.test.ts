import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../../src/rules/org/webhooks-use-https.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import { makeOrgHooksResponse } from '../../../helpers/fixtures.ts';

const ENDPOINT = '/orgs/silverwalls-labs/hooks';

describe('org/webhooks-use-https', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when no webhooks exist', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, []);

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports no findings when all webhooks use HTTPS with verification', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, makeOrgHooksResponse([ { id: 1, url: 'https://example.com/hook' } ]));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when webhooks use plain HTTP or skip SSL verification', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, makeOrgHooksResponse([
				{ id: 1, url: 'http://example.com/hook' },
				{
					id: 2, url: 'https://example.com/hook', insecureSsl: '1',
				},
				{ id: 3, url: 'https://example.com/hook' },
			]));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'org/webhooks-use-https');
		assert.equal(findings[0]?.severity, 'medium');
		assert.equal(findings[0]?.org, 'silverwalls-labs');
		assert.equal(findings[0]?.repo, undefined);
		assert.match(findings[0]?.detail ?? '', /#1.*plain http/);
		assert.match(findings[0]?.detail ?? '', /#2.*ssl verification disabled/);
		assert.doesNotMatch(findings[0]?.detail ?? '', /#3/);
	});

	test('skips on a permission-denied 403', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(403, { message: 'Must have admin rights' });

		await assert.rejects(rule.check(makeOrgContext()), RuleSkipped);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeOrgContext()));
	});
});
