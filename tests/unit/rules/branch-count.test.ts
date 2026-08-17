import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/branch-count.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/branches';
const BASE = 'https://api.github.com';

describe('repo-config/branch-count', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when branch count is at threshold', async () => {
		nock(BASE)
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, makeBranches(100));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when branch count exceeds threshold', async () => {
		const next = `<${BASE}${ENDPOINT}?per_page=100&page=2>; rel="next"`;

		nock(BASE)
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, makeBranches(100), { Link: next });
		nock(BASE)
			.get(ENDPOINT)
			.query({ per_page: '100', page: '2' })
			.reply(200, makeBranches(50, 100));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'repo-config/branch-count');
		assert.equal(findings[0]?.severity, 'low');
		assert.match(findings[0]?.title ?? '', /150 branches/);
	});

	test('reports no findings when repository has zero branches', async () => {
		nock(BASE)
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, []);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});

function makeBranches(count: number, startIndex = 0) {
	return Array.from({ length: count }, function makeBranch(_, i) {
		return { name: `branch-${startIndex + i}`, commit: { sha: 'abc' } };
	});
}
