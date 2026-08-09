import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/access/codeowners-file-present.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when CODEOWNERS is at the root', rootCase);

async function rootCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/contents/CODEOWNERS')
		.reply(200, {
			name: 'CODEOWNERS',
			path: 'CODEOWNERS',
			type: 'file',
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports no findings when CODEOWNERS is under .github/', dotGithubCase);

async function dotGithubCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/contents/CODEOWNERS')
		.reply(404);
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/contents/.github%2FCODEOWNERS')
		.reply(200, {
			name: 'CODEOWNERS',
			path: '.github/CODEOWNERS',
			type: 'file',
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when no CODEOWNERS is present', missingCase);

async function missingCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/contents/CODEOWNERS')
		.reply(404);
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/contents/.github%2FCODEOWNERS')
		.reply(404);
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/contents/docs%2FCODEOWNERS')
		.reply(404);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'access/codeowners-file-present');
	assert.equal(findings[0]?.severity, 'medium');
}
