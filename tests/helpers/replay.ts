import { readFileSync } from 'node:fs';
import nock from 'nock';

type FixtureEntry = {
	method: string;
	path: string;
	query?: Record<string, string>;
	status: number;
	body: unknown;
};

type FixtureFile = {
	capturedAt: string;
	owner: string;
	repo: string;
	defaultBranch: string;
	entries: FixtureEntry[];
};

const BASE = 'https://api.github.com';

/**
 * Loads a fixture file and sets up nock interceptors to replay every
 * recorded API response. Call in beforeEach; pair with nock.cleanAll()
 * in afterEach.
 *
 * Handles URL-encoded paths (e.g. .github%2FSECURITY.md) by registering
 * both the literal and encoded forms for /contents/ paths.
 */
export function replayFixture(fixturePath: string): FixtureFile {
	const raw = readFileSync(fixturePath, 'utf-8');
	const fixture = JSON.parse(raw) as FixtureFile;

	for (const entry of fixture.entries) {
		const resolved = entry.path
			.replace('{owner}', fixture.owner)
			.replace('{repo}', fixture.repo);

		registerInterceptor(entry.method, resolved, entry.query, entry.status, entry.body);

		const encoded = encodeContentsPath(resolved);

		if (encoded !== resolved) {
			registerInterceptor(entry.method, encoded, entry.query, entry.status, entry.body);
		}
	}

	return fixture;
}

function encodeContentsPath(path: string): string {
	const prefix = '/contents/';
	const idx = path.indexOf(prefix);

	if (idx === - 1) {
		return path;
	}

	const before = path.slice(0, idx + prefix.length);
	const rest = path.slice(idx + prefix.length);
	const encodedRest = encodeURIComponent(rest);

	return encodedRest === rest ?
		path :
		before + encodedRest;
}

function registerInterceptor(
	method: string,
	path: string,
	query: Record<string, string> | undefined,
	status: number,
	body: unknown,
): void {
	const scope = nock(BASE);
	const verb = method.toLowerCase();

	if (verb === 'get' || verb === 'head') {
		const interceptor = query ?
			scope[verb](path).query(query) :
			scope[verb](path);

		if (body === null) {
			interceptor.reply(status);
		} else {
			interceptor.reply(status, body as nock.Body);
		}
	}
}
