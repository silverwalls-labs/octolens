import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/access/required-custom-properties.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when all required properties are set', allSetCase);

async function allSetCase() {
	nock('https://api.github.com')
		.get('/orgs/sheplu/properties/schema')
		.reply(200, [
			{ property_name: 'team', required: true },
			{ property_name: 'compliance', required: true },
		]);
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/properties/values')
		.reply(200, [
			{ property_name: 'team', value: 'payments' },
			{ property_name: 'compliance', value: 'pci' },
		]);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding for each missing required property', missingCase);

async function missingCase() {
	nock('https://api.github.com')
		.get('/orgs/sheplu/properties/schema')
		.reply(200, [
			{ property_name: 'team', required: true },
			{ property_name: 'compliance', required: true },
		]);
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/properties/values')
		.reply(200, [ { property_name: 'team', value: 'payments' } ]);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'access/required-custom-properties');
	assert.match(findings[0]?.title ?? '', /compliance/);
}

test('reports a finding when value is empty string', emptyValueCase);

async function emptyValueCase() {
	nock('https://api.github.com')
		.get('/orgs/sheplu/properties/schema')
		.reply(200, [ { property_name: 'team', required: true } ]);
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/properties/values')
		.reply(200, [ { property_name: 'team', value: '' } ]);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
}

test('does not fire when org schema is not accessible (404)', schema404Case);

async function schema404Case() {
	nock('https://api.github.com')
		.get('/orgs/sheplu/properties/schema')
		.reply(404, { message: 'Not Found' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('does not fire when no properties are required', noRequiredCase);

async function noRequiredCase() {
	nock('https://api.github.com')
		.get('/orgs/sheplu/properties/schema')
		.reply(200, [ { property_name: 'team', required: false } ]);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get('/orgs/sheplu/properties/schema')
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
