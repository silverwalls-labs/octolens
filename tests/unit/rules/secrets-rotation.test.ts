import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/security/secrets-rotation.ts';
import { RuleSkipped } from '../../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

const ACTIONS = '/repos/sheplu/Octolens/actions/secrets';
const DEPENDABOT = '/repos/sheplu/Octolens/dependabot/secrets';
const CODESPACES = '/repos/sheplu/Octolens/codespaces/secrets';
const BASE = 'https://api.github.com';

beforeEach(disableNet);
afterEach(restoreNet);

function isoDaysAgo(days: number): string {
	const ms = Date.now() - (days * 24 * 60 * 60 * 1000);

	return new Date(ms).toISOString();
}

function secretBody(secrets: { name: string; ageDays: number; }[]) {
	return {
		total_count: secrets.length,
		secrets: secrets.map(function toSecret(s) {
			const updated = isoDaysAgo(s.ageDays);

			return {
				name: s.name,
				created_at: updated,
				updated_at: updated,
			};
		}),
	};
}

function mockSecrets(
	endpoint: string,
	status: number,
	body: ReturnType<typeof secretBody> | undefined = undefined,
): void {
	const interceptor = nock(BASE)
		.get(endpoint)
		.query({ per_page: '100' });

	if (body === undefined) {
		interceptor.reply(status);
	} else {
		interceptor.reply(status, body);
	}
}

function mockEmpty() {
	mockSecrets(ACTIONS, 200, secretBody([]));
	mockSecrets(DEPENDABOT, 200, secretBody([]));
	mockSecrets(CODESPACES, 200, secretBody([]));
}

test('reports no findings when no secrets exist', emptyCase);

async function emptyCase() {
	mockEmpty();

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports no findings when all secrets are within rotation window', freshCase);

async function freshCase() {
	mockSecrets(ACTIONS, 200, secretBody([ { name: 'NPM_TOKEN', ageDays: 30 } ]));
	mockSecrets(DEPENDABOT, 200, secretBody([ { name: 'PRIVATE_REGISTRY', ageDays: 89 } ]));
	mockSecrets(CODESPACES, 200, secretBody([]));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding aggregating stale secrets across stores', staleCase);

async function staleCase() {
	mockSecrets(ACTIONS, 200, secretBody([
		{ name: 'FRESH', ageDays: 10 },
		{ name: 'STALE_ACTIONS', ageDays: 200 },
	]));
	mockSecrets(DEPENDABOT, 200, secretBody([ { name: 'STALE_DEP', ageDays: 365 } ]));
	mockSecrets(CODESPACES, 200, secretBody([]));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'security/secrets-rotation');
	assert.equal(findings[0]?.severity, 'low');
	assert.match(findings[0]?.detail ?? '', /actions\/STALE_ACTIONS/);
	assert.match(findings[0]?.detail ?? '', /dependabot\/STALE_DEP/);
	assert.doesNotMatch(findings[0]?.detail ?? '', /FRESH/);
}

test('treats secrets with unparseable dates as fresh', badDateCase);

async function badDateCase() {
	const badBody = {
		total_count: 1,
		secrets: [
			{
				name: 'BAD_DATE',
				created_at: 'not-a-date',
				updated_at: 'not-a-date',
			},
		],
	};

	mockSecrets(ACTIONS, 200, badBody);
	mockSecrets(DEPENDABOT, 200, secretBody([]));
	mockSecrets(CODESPACES, 200, secretBody([]));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('skips when all secret endpoints return a permission 403', forbiddenCase);

async function forbiddenCase() {
	mockSecrets(ACTIONS, 403);
	mockSecrets(DEPENDABOT, 403);
	mockSecrets(CODESPACES, 403);

	await assert.rejects(rule.check(makeContext()), RuleSkipped);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock(BASE)
		.get(ACTIONS)
		.query({ per_page: '100' })
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}

test('unreadable stores are ignored when another store is readable', mixedAccessCase);

async function mixedAccessCase() {
	mockSecrets(ACTIONS, 403);
	mockSecrets(DEPENDABOT, 200, secretBody([ { name: 'OLD_TOKEN', ageDays: 200 } ]));
	mockSecrets(CODESPACES, 200, secretBody([]));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.match(findings[0]?.detail ?? '', /OLD_TOKEN/);
}
