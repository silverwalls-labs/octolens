import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Read the package version from `package.json`.
 *
 * Resolves the path relative to the current module location unless an
 * explicit path is given. Falls back to `'0.0.0'` if the `version`
 * field is missing.
 *
 * @param pkgPath - Optional path to a `package.json` file.
 */
export function readVersion(pkgPath?: string): string {
	if (pkgPath === undefined) {
		const here = dirname(fileURLToPath(import.meta.url));

		pkgPath = resolve(here, '..', '..', 'package.json');
	}

	const raw = readFileSync(pkgPath, 'utf8');
	const pkg = JSON.parse(raw) as { version?: string; };

	return pkg.version ?? '0.0.0';
}
