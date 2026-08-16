import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectLabel } from '../../../src/output/subject.ts';
import type { Finding } from '../../../src/types/index.ts';

function makeFinding(overrides: Partial<Finding>): Finding {
	return {
		ruleId: 'repo-config/branch-protection-required',
		severity: 'high',
		title: 'test finding',
		...overrides,
	};
}

test('subjectLabel prefers the repository reference', repoLabel);

function repoLabel() {
	const finding = makeFinding({ repo: { owner: 'sheplu', name: 'Octolens' }, org: 'acme' });

	assert.equal(subjectLabel(finding), 'sheplu/Octolens');
}

test('subjectLabel falls back to the org login', orgLabel);

function orgLabel() {
	assert.equal(subjectLabel(makeFinding({ org: 'acme' })), 'acme');
}

test('subjectLabel is empty without a repo or org', emptyLabel);

function emptyLabel() {
	assert.equal(subjectLabel(makeFinding({})), '');
}
