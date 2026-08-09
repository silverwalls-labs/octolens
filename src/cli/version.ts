import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export function readVersion(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const pkgPath = resolve(here, '..', '..', 'package.json');
	const raw = readFileSync(pkgPath, 'utf8');
	const pkg = JSON.parse(raw) as { version?: string; };

	return pkg.version ?? '0.0.0';
}
