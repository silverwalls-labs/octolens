import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/access/required-custom-properties.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import {
	makeOrgPropertySchema,
	makeRepoPropertyValues,
} from '../../helpers/fixtures.ts';

describe('access/required-custom-properties', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when all required properties are set', async () => {
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
	});

	test('reports a finding for each missing required property', async () => {
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
	});

	test('reports a finding when value is empty string', async () => {
		nock('https://api.github.com')
			.get('/orgs/sheplu/properties/schema')
			.reply(200, [ { property_name: 'team', required: true } ]);
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/properties/values')
			.reply(200, [ { property_name: 'team', value: '' } ]);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
	});

	test('does not fire when org schema is not accessible (404)', async () => {
		nock('https://api.github.com')
			.get('/orgs/sheplu/properties/schema')
			.reply(404, { message: 'Not Found' });

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('does not fire when no properties are required', async () => {
		nock('https://api.github.com')
			.get('/orgs/sheplu/properties/schema')
			.reply(200, [ { property_name: 'team', required: false } ]);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports no findings when required property has a non-empty array value', async () => {
		nock('https://api.github.com')
			.get('/orgs/sheplu/properties/schema')
			.reply(200, makeOrgPropertySchema([ { property_name: 'team', required: true } ]));
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/properties/values')
			.reply(
				200,
				makeRepoPropertyValues([ { property_name: 'team', value: [ 'engineering' ] } ]),
			);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when required property has an empty array value', async () => {
		nock('https://api.github.com')
			.get('/orgs/sheplu/properties/schema')
			.reply(200, makeOrgPropertySchema([ { property_name: 'team', required: true } ]));
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/properties/values')
			.reply(200, makeRepoPropertyValues([ { property_name: 'team', value: [] } ]));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get('/orgs/sheplu/properties/schema')
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});

	test('reports no findings when property values are unreadable', async () => {
		nock('https://api.github.com')
			.get('/orgs/sheplu/properties/schema')
			.reply(200, makeOrgPropertySchema([ { property_name: 'team', required: true } ]));
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/properties/values')
			.reply(404);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when a required value is explicitly null', async () => {
		nock('https://api.github.com')
			.get('/orgs/sheplu/properties/schema')
			.reply(200, makeOrgPropertySchema([ { property_name: 'team', required: true } ]));
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/properties/values')
			.reply(200, makeRepoPropertyValues([ { property_name: 'team', value: null } ]));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.match(findings[0]?.title ?? '', /team/);
	});
});
