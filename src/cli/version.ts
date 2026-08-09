import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Read the package version from `package.json`.
 *
 * Resolves the path relative to the current module location.
 * Falls back to `'0.0.0'` if the `version` field is missing.
 */
export function readVersion(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const pkgPath = resolve(here, '..', '..', 'package.json');
	const raw = readFileSync(pkgPath, 'utf8');
	const pkg = JSON.parse(raw) as { version?: string; };

	return pkg.version ?? '0.0.0';
}
