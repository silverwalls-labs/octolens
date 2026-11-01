import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPretty } from '../../../src/output/pretty.ts';
import type {
	Finding, RuleRun, ScanResult,
} from '../../../src/types/index.ts';

const FINDING: Finding = {
	ruleId: 'repo-config/branch-protection-required',
	severity: 'critical',
	repo: { owner: 'sheplu', name: 'editorconfig' },
	title: 'Default branch is not protected',
};

describe('formatPretty', () => {
	test(
		'renders a coverage footer covering every run outcome',
		() => {
			const runs: RuleRun[] = [
				{
					ruleId: 'repo-config/branch-protection-required',
					status: 'ok',
					findings: [ FINDING ],
					durationMs: 5,
				},
				{
					ruleId: 'repo-config/license-file-present',
					status: 'ok',
					findings: [],
					durationMs: 1,
				},
				{
					ruleId: 'access/required-custom-properties',
					status: 'skipped',
					findings: [],
					durationMs: 0,
				},
				{
					ruleId: 'security/secrets-rotation',
					status: 'error',
					findings: [],
					error: 'boom',
					durationMs: 2,
				},
			];
			const out = formatPretty(
				makeResult([ FINDING ], runs),
				{ color: false },
			);

			assert.match(
				out,
				/1 passed · 1 flagged · 1 skipped · 1 errored/,
			);
		},
	);

	test(
		'omits the coverage footer when no runs are present',
		() => {
			const out = formatPretty(
				makeResult([ FINDING ]),
				{ color: false },
			);

			assert.doesNotMatch(out, /passed ·/);
		},
	);

	test('renders org target label', () => {
		const result: ScanResult = {
			...makeResult([]),
			target: { type: 'org', org: 'my-org' },
		};
		const out = formatPretty(result, { color: false });

		assert.match(out, /my-org/);
	});

	test(
		'renders org findings with the org login as subject label',
		() => {
			const orgFinding: Finding = {
				ruleId: 'org/two-factor-required',
				severity: 'high',
				org: 'my-org',
				title: 'Two-factor authentication is not required',
			};
			const result: ScanResult = {
				...makeResult([ orgFinding ]),
				target: { type: 'org', org: 'my-org' },
			};
			const out = formatPretty(result, { color: false });

			assert.match(
				out,
				/org\/two-factor-required - my-org/,
			);
			assert.doesNotMatch(out, /undefined/);
		},
	);

	test(
		'renders finding detail, remediation, and references',
		() => {
			const full: Finding = {
				...FINDING,
				detail: 'The default branch has no protection rule.',
				remediation: 'Add a branch protection rule.',
				references: [
					{
						name: 'About branches',
						url: 'https://example.com',
					},
				],
			};
			const out = formatPretty(makeResult([ full ]), { color: false });

			assert.match(
				out,
				/The default branch has no protection rule\./,
			);
			assert.match(
				out,
				/Remediation: Add a branch protection rule\./,
			);
			assert.match(
				out,
				/About branches: https:\/\/example\.com/,
			);
		},
	);

	test(
		'renders no-findings message when findings are empty',
		() => {
			const out = formatPretty(makeResult([]), { color: false });

			assert.match(
				out,
				/No findings at or above severity threshold\./,
			);
		},
	);

	test(
		'uses identity colorizer when color option is true',
		() => {
			const out = formatPretty(makeResult([ FINDING ]), { color: true });

			assert.match(out, /CRITICAL/);
			assert.match(
				out,
				/Default branch is not protected/,
			);
		},
	);

	test('colors medium, low, and info findings', () => {
		const findings: Finding[] = [
			{ ...FINDING, severity: 'low' },
			{ ...FINDING, severity: 'info' },
			{ ...FINDING, severity: 'medium' },
		];
		const output = formatPretty(makeResult(findings), { color: true });

		assert.match(output, /MEDIUM/);
		assert.match(output, /LOW/);
		assert.match(output, /INFO/);
	});

	test(
		'color defaults to the terminal capability when unset',
		() => {
			const output = formatPretty(makeResult([ FINDING ]));

			assert.match(output, /editorconfig/);
		},
	);

	test(
		'default color is enabled on a TTY with a capable TERM',
		() => {
			const restoreTTY = stubIsTTY(true);
			const restoreTerm = stubEnv('TERM', 'xterm-256color');
			const restoreNoColor = stubEnv('NO_COLOR', undefined);

			try {
				const output = formatPretty(makeResult([ FINDING ]));

				assert.match(output, /\u001b\[/);
			} finally {
				restoreTTY();
				restoreTerm();
				restoreNoColor();
			}
		},
	);

	test(
		'TERM=dumb disables default color even on a TTY',
		() => {
			const restoreTTY = stubIsTTY(true);
			const restoreTerm = stubEnv('TERM', 'dumb');
			const restoreNoColor = stubEnv('NO_COLOR', undefined);

			try {
				const output = formatPretty(makeResult([ FINDING ]));

				assert.doesNotMatch(output, /\u001b\[/);
			} finally {
				restoreTTY();
				restoreTerm();
				restoreNoColor();
			}
		},
	);

	test(
		'NO_COLOR disables default color even on a TTY',
		() => {
			const restoreTTY = stubIsTTY(true);
			const restoreTerm = stubEnv('TERM', 'xterm-256color');
			const restoreNoColor = stubEnv('NO_COLOR', '1');

			try {
				const output = formatPretty(makeResult([ FINDING ]));

				assert.doesNotMatch(output, /\u001b\[/);
			} finally {
				restoreTTY();
				restoreTerm();
				restoreNoColor();
			}
		},
	);
});

/**
 * Override `process.stdout.isTTY` and return a function restoring the
 * original property descriptor.
 *
 * @param value - The stubbed TTY flag.
 * @returns     Call to restore the original descriptor.
 */
function stubIsTTY(value: boolean): () => void {
	const saved = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

	Object.defineProperty(process.stdout, 'isTTY', {
		value,
		configurable: true,
	});

	return () => {
		if (saved === undefined) {
			delete (process.stdout as { isTTY?: boolean; }).isTTY;
		} else {
			Object.defineProperty(process.stdout, 'isTTY', saved);
		}
	};
}

/**
 * Override an environment variable and return a function restoring the
 * original value. Setting `undefined` unsets the variable.
 *
 * @param name  - Environment variable name.
 * @param value - Value to set, or `undefined` to unset.
 * @returns     Call to restore the original value.
 */
function stubEnv(name: string, value: string | undefined): () => void {
	const saved = process.env[name];

	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}

	return () => {
		if (saved === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = saved;
		}
	};
}

function makeResult(
	findings: Finding[],
	runs: RuleRun[] = [],
): ScanResult {
	const findingsBySeverity = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		info: 0,
	};

	for (const f of findings) {
		findingsBySeverity[f.severity]++;
	}

	return {
		schemaVersion: 1,
		target: {
			type: 'repo',
			owner: 'sheplu',
			name: 'editorconfig',
		},
		threshold: 'info',
		runs,
		findings,
		summary: {
			rulesRun: runs.length,
			rulesErrored: runs.filter((r) => r.status === 'error').length,
			rulesSkipped: runs.filter((r) => r.status === 'skipped').length,
			findingsTotal: findings.length,
			findingsBySeverity,
		},
	};
}
