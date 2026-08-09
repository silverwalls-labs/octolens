import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/security/scope-secrets-to-environments.ts';
import { RuleSkipped } from '../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/actions/secrets';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when repo has no Actions secrets', emptyCase);

async function emptyCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(200, { total_count: 0, secrets: [] });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when repo-level Actions secrets exist', presentCase);

async function presentCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(200, {
			total_count: 2,
			secrets: [
				{
					name: 'NPM_TOKEN',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z',
				},
				{
					name: 'AWS_KEY',
					created_at: '2024-02-01T00:00:00Z',
					updated_at: '2024-02-01T00:00:00Z',
				},
			],
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'security/scope-secrets-to-environments');
	assert.equal(findings[0]?.severity, 'info');
	assert.match(findings[0]?.detail ?? '', /NPM_TOKEN.*AWS_KEY/);
}

test('skips when the secrets endpoint returns a permission 403', forbiddenCase);

async function forbiddenCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(403, { message: 'Forbidden' });

	await assert.rejects(rule.check(makeContext()), RuleSkipped);
}
