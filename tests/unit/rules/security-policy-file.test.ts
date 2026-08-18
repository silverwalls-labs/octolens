import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/security/security-policy-file.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

describe('security/security-policy-file', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when SECURITY.md is at the repo root', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/contents/SECURITY.md')
			.reply(200, {
				name: 'SECURITY.md',
				path: 'SECURITY.md',
				type: 'file',
			});

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports no findings when SECURITY.md is under .github/', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/contents/SECURITY.md')
			.reply(404);
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/contents/.github%2FSECURITY.md')
			.reply(200, {
				name: 'SECURITY.md',
				path: '.github/SECURITY.md',
				type: 'file',
			});

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when no SECURITY.md is present', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/contents/SECURITY.md')
			.reply(404);
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/contents/.github%2FSECURITY.md')
			.reply(404);
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/contents/docs%2FSECURITY.md')
			.reply(404);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'security/security-policy-file');
		assert.equal(findings[0]?.severity, 'medium');
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/contents/SECURITY.md')
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});
