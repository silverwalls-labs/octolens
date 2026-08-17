import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/access/admin-count.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/collaborators';

describe('access/admin-count', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when admin count is at threshold', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ affiliation: 'direct', per_page: '100' })
			.reply(200, [
				makeCollab('alice', 'admin'),
				makeCollab('bob', 'admin'),
				makeCollab('carol', 'admin'),
				makeCollab('dave', 'write'),
			]);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when admin count exceeds threshold', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ affiliation: 'direct', per_page: '100' })
			.reply(200, [
				makeCollab('alice', 'admin'),
				makeCollab('bob', 'admin'),
				makeCollab('carol', 'admin'),
				makeCollab('dave', 'admin'),
			]);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'access/admin-count');
		assert.equal(findings[0]?.severity, 'medium');
		assert.match(findings[0]?.detail ?? '', /alice.*bob.*carol.*dave/);
	});

	test('reports no findings when collaborator endpoint returns 403', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ affiliation: 'direct', per_page: '100' })
			.reply(403, { message: 'Forbidden' });

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ affiliation: 'direct', per_page: '100' })
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});

function makeCollab(login: string, role: string) {
	return {
		login,
		role_name: role,
		permissions: { admin: role === 'admin' },
	};
}
