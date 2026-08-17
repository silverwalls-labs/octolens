import {
	describe, test, afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readVersion } from '../../../src/cli/version.ts';

const tempDirs: string[] = [];

describe('readVersion', () => {
	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('readVersion returns the package version by default', () => {
		assert.match(readVersion(), /^\d+\.\d+\.\d+/);
	});

	test('readVersion reads an explicit package.json path', () => {
		const path = writePackageJson({ version: '9.9.9' });

		assert.equal(readVersion(path), '9.9.9');
	});

	test('readVersion falls back when the version field is missing', () => {
		const path = writePackageJson({ name: 'no-version' });

		assert.equal(readVersion(path), '0.0.0');
	});
});

function writePackageJson(body: Record<string, unknown>): string {
	const dir = mkdtempSync(join(tmpdir(), 'octolens-version-'));
	const path = join(dir, 'package.json');

	writeFileSync(path, JSON.stringify(body));
	tempDirs.push(dir);

	return path;
}
