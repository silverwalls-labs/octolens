/*
 * Captures all GitHub API responses for a target repo and writes them
 * to a JSON fixture file. Run with:
 *
 *   GITHUB_TOKEN=<token> npx tsx scripts/capture-fixtures.ts [owner/repo]
 *
 * Default target: silverwalls-labs/review
 */

import { writeFileSync } from 'node:fs';
import { Octokit } from '@octokit/rest';

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

const token = process.env['GITHUB_TOKEN'] ?? process.env['OCTOLENS_TOKEN'];

if (!token) {
	console.error('GITHUB_TOKEN or OCTOLENS_TOKEN is required.');
	process.exit(1);
}

const target = process.argv[2] ?? 'silverwalls-labs/review';
const [ owner, repo ] = target.split('/');

if (!owner || !repo) {
	console.error('Usage: capture-fixtures.ts [owner/repo]');
	process.exit(1);
}

const octokit = new Octokit({ auth: token });
const entries: FixtureEntry[] = [];

async function capture(
	method: string,
	path: string,
	query?: Record<string, string>,
): Promise<void> {
	const fullPath = query ?
		`${path}?${new URLSearchParams(query).toString()}` :
		path;

	try {
		const response = await octokit.request(`${method} ${path}`, {
			owner,
			repo,
			...query,
		});

		entries.push({
			method, path, query, status: response.status, body: response.data,
		});
		console.log(`  ✔ ${method} ${fullPath} → ${response.status}`);
	} catch (err: unknown) {
		const status = (err as { status?: number; }).status ?? 0;
		const body = (err as { response?: { data?: unknown; }; }).response?.data ?? null;

		entries.push({
			method, path, query, status, body,
		});
		console.log(`  ✔ ${method} ${fullPath} → ${status}`);
	}
}

console.log(`Capturing fixtures for ${owner}/${repo}...\n`);

// 1. Repo metadata
await capture('GET', '/repos/{owner}/{repo}');

// Determine default branch
const repoEntry = entries[0];
const repoBody = repoEntry?.body as Record<string, unknown> | undefined;
const defaultBranch = (repoBody?.default_branch as string) ?? 'main';

// 2. Branch protection
await capture('GET', `/repos/{owner}/{repo}/branches/${defaultBranch}/protection`);

// 3. Vulnerability alerts (GET — returns 204 if enabled, 404 if disabled)
await capture('GET', '/repos/{owner}/{repo}/vulnerability-alerts');

// 4. Automated security fixes
await capture('GET', '/repos/{owner}/{repo}/automated-security-fixes');

// 5. Rulesets
await capture('GET', '/repos/{owner}/{repo}/rulesets');

// 6. Environments
await capture('GET', '/repos/{owner}/{repo}/environments', { per_page: '100' });

// 7. Branches
await capture('GET', '/repos/{owner}/{repo}/branches', { per_page: '100' });

// 8. Actions permissions
await capture('GET', '/repos/{owner}/{repo}/actions/permissions');

// 9. Default workflow permissions
await capture('GET', '/repos/{owner}/{repo}/actions/permissions/workflow');

// 10. Allowed actions
await capture('GET', '/repos/{owner}/{repo}/actions/permissions/selected-actions');

// 11-13. Secrets (actions, dependabot, codespaces)
await capture('GET', '/repos/{owner}/{repo}/actions/secrets', { per_page: '100' });
await capture('GET', '/repos/{owner}/{repo}/dependabot/secrets', { per_page: '100' });
await capture('GET', '/repos/{owner}/{repo}/codespaces/secrets', { per_page: '100' });

// 14. Code scanning
await capture('GET', '/repos/{owner}/{repo}/code-scanning/analyses', { per_page: '1' });

// 15-17. Security policy
await capture('GET', '/repos/{owner}/{repo}/contents/SECURITY.md');
await capture('GET', '/repos/{owner}/{repo}/contents/.github/SECURITY.md');
await capture('GET', '/repos/{owner}/{repo}/contents/docs/SECURITY.md');

// 18-20. CODEOWNERS
await capture('GET', '/repos/{owner}/{repo}/contents/CODEOWNERS');
await capture('GET', '/repos/{owner}/{repo}/contents/.github/CODEOWNERS');
await capture('GET', '/repos/{owner}/{repo}/contents/docs/CODEOWNERS');

// 21. Codeowners errors
await capture('GET', '/repos/{owner}/{repo}/codeowners/errors');

// 22. Private vulnerability reporting
await capture('GET', '/repos/{owner}/{repo}/private-vulnerability-reporting');

// 23-24. Collaborators
await capture('GET', '/repos/{owner}/{repo}/collaborators', {
	affiliation: 'direct', per_page: '100',
});
await capture('GET', '/repos/{owner}/{repo}/collaborators', {
	affiliation: 'outside', per_page: '100',
});

// 25. Teams
await capture('GET', '/repos/{owner}/{repo}/teams', { per_page: '100' });

// 26. Webhooks
await capture('GET', '/repos/{owner}/{repo}/hooks', { per_page: '100' });

// 27. Deploy keys
await capture('GET', '/repos/{owner}/{repo}/keys', { per_page: '100' });

// 28. Self-hosted runners
await capture('GET', '/repos/{owner}/{repo}/actions/runners', { per_page: '100' });

// 29. Org custom properties schema
try {
	const schemaResp = await octokit.request(
		'GET /orgs/{org}/properties/schema',
		{ org: owner },
	);

	entries.push({
		method: 'GET',
		path: '/orgs/{owner}/properties/schema',
		status: schemaResp.status,
		body: schemaResp.data,
	});
	console.log(`  ✔ GET /orgs/${owner}/properties/schema → ${schemaResp.status}`);
} catch (err: unknown) {
	const status = (err as { status?: number; }).status ?? 0;
	const body = (err as { response?: { data?: unknown; }; }).response?.data ?? null;

	entries.push({
		method: 'GET',
		path: '/orgs/{owner}/properties/schema',
		status,
		body,
	});
	console.log(`  ✔ GET /orgs/${owner}/properties/schema → ${status}`);
}

// 30. Repo custom property values
await capture('GET', '/repos/{owner}/{repo}/properties/values');

const fixture: FixtureFile = {
	capturedAt: new Date().toISOString(),
	owner,
	repo,
	defaultBranch,
	entries,
};

const outPath = 'tests/fixtures/silverwalls-labs-review.json';

writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
console.log(`\nWritten ${entries.length} entries to ${outPath}`);
