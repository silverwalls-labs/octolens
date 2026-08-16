/*
 * Merges the per-category lcov files produced by the test:*:cov scripts
 * into one aggregate coverage report. Run with:
 *
 *   npx tsx scripts/coverage-report.ts [--out <file>]
 *
 * Reads coverage/{unit,integration,smoke,fuzz}.lcov, prints a markdown
 * table (per category plus a merged global row over every src file),
 * and exits non-zero when the global line coverage drops below the
 * gate or when a src file is loaded by no suite at all.
 *
 * The per-category thresholds shown here are informational — the hard
 * per-category enforcement lives in the --test-coverage-* flags of the
 * package.json test:*:cov scripts. Keep both in sync.
 */

import {
	existsSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** Global line-coverage gate (issue #10: ensure 98% coverage). */
const GLOBAL_LINES_GATE = 98;

/** Categories aggregated into the global number, in display order. */
const CATEGORIES = [
	'unit',
	'integration',
	'smoke',
	'fuzz',
] as const;

type Category = typeof CATEGORIES[number];

/** Mirrors the --test-coverage-* flags in package.json. */
const THRESHOLDS: Record<Category, {
	lines: number; branches: number; functions: number;
} | null> = {
	unit: {
		lines: 100, branches: 98, functions: 100,
	},
	integration: {
		lines: 90, branches: 85, functions: 90,
	},
	smoke: {
		lines: 75, branches: 70, functions: 75,
	},
	fuzz: null,
};

type FileCoverage = {
	/** line number -> hit count */
	lines: Map<number, number>;

	/** function name -> hit count */
	functions: Map<string, number>;

	/** "line:block:branch" -> taken count */
	branches: Map<string, number>;
};

type CoverageMap = Map<string, FileCoverage>;

type Metrics = {
	lines: number | null;
	branches: number | null;
	functions: number | null;
};

function parseLcov(content: string): CoverageMap {
	const files: CoverageMap = new Map();
	let current: FileCoverage | null = null;

	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();

		if (line.startsWith('SF:')) {
			const path = line.slice(3);

			current = files.get(path) ?? {
				lines: new Map(),
				functions: new Map(),
				branches: new Map(),
			};
			files.set(path, current);
			continue;
		}

		if (current === null) {
			continue;
		}

		if (line.startsWith('DA:')) {
			const [ lineNo, hits ] = line.slice(3).split(',');

			addHits(current.lines, Number(lineNo), Number(hits));
		} else if (line.startsWith('FNDA:')) {
			const comma = line.indexOf(',');
			const hits = Number(line.slice(5, comma));
			const name = line.slice(comma + 1);

			addHits(current.functions, name, hits);
		} else if (line.startsWith('BRDA:')) {
			const [
				lineNo,
				block,
				branch,
				taken,
			] = line.slice(5).split(',');

			addHits(current.branches, `${lineNo}:${block}:${branch}`, taken === '-' ?
				0 :
				Number(taken));
		} else if (line === 'end_of_record') {
			current = null;
		}
	}

	return files;
}

function addHits<K>(map: Map<K, number>, key: K, hits: number): void {
	map.set(key, (map.get(key) ?? 0) + (Number.isFinite(hits) ?
		hits :
		0));
}

function mergeInto(target: CoverageMap, source: CoverageMap): void {
	for (const [ path, coverage ] of source) {
		const existing = target.get(path);

		if (existing === undefined) {
			target.set(path, {
				lines: new Map(coverage.lines),
				functions: new Map(coverage.functions),
				branches: new Map(coverage.branches),
			});
			continue;
		}

		for (const [ line, hits ] of coverage.lines) {
			addHits(existing.lines, line, hits);
		}
		for (const [ name, hits ] of coverage.functions) {
			addHits(existing.functions, name, hits);
		}
		for (const [ key, hits ] of coverage.branches) {
			addHits(existing.branches, key, hits);
		}
	}
}

function computeMetrics(files: CoverageMap): Metrics {
	let lineTotal = 0;
	let lineHit = 0;
	let funcTotal = 0;
	let funcHit = 0;
	let branchTotal = 0;
	let branchHit = 0;

	for (const coverage of files.values()) {
		for (const hits of coverage.lines.values()) {
			lineTotal++;
			if (hits > 0) lineHit++;
		}
		for (const hits of coverage.functions.values()) {
			funcTotal++;
			if (hits > 0) funcHit++;
		}
		for (const hits of coverage.branches.values()) {
			branchTotal++;
			if (hits > 0) branchHit++;
		}
	}

	return {
		lines: ratio(lineHit, lineTotal),
		branches: ratio(branchHit, branchTotal),
		functions: ratio(funcHit, funcTotal),
	};
}

function ratio(hit: number, total: number): number | null {
	return total === 0 ?
		null :
		(hit / total) * 100;
}

function formatPercent(value: number | null): string {
	return value === null ?
		'—' :
		`${value.toFixed(2)}%`;
}

function listSourceFiles(dir: string): string[] {
	const found: string[] = [];

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);

		if (entry.isDirectory()) {
			found.push(...listSourceFiles(path));
		} else if (entry.name.endsWith('.ts')) {
			found.push(path);
		}
	}

	return found;
}

function categoryStatus(category: Category, metrics: Metrics): string {
	const thresholds = THRESHOLDS[category];

	if (thresholds === null) {
		return '—';
	}

	const passed = (metrics.lines ?? 0) >= thresholds.lines &&
		(metrics.branches ?? 0) >= thresholds.branches &&
		(metrics.functions ?? 0) >= thresholds.functions;

	return passed ?
		'✅' :
		'❌';
}

function thresholdLabel(category: Category): string {
	const thresholds = THRESHOLDS[category];

	return thresholds === null ?
		'—' :
		`${thresholds.lines}/${thresholds.branches}/${thresholds.functions}`;
}

// --- main ---

const outFlagIndex = process.argv.indexOf('--out');
const outPath = outFlagIndex === - 1 ?
	undefined :
	process.argv[outFlagIndex + 1];

const merged: CoverageMap = new Map();
const rows: string[] = [];
const missing: Category[] = [];

for (const category of CATEGORIES) {
	const lcovPath = join('coverage', `${category}.lcov`);

	if (!existsSync(lcovPath)) {
		missing.push(category);
		rows.push(`| ${category} | — | — | — | ${thresholdLabel(category)} | ⚠️ missing |`);
		continue;
	}

	const files = parseLcov(readFileSync(lcovPath, 'utf8'));

	mergeInto(merged, files);
	const metrics = computeMetrics(files);

	rows.push(`| ${category} | ${formatPercent(metrics.lines)} | ` +
		`${formatPercent(metrics.branches)} | ${formatPercent(metrics.functions)} | ` +
		`${thresholdLabel(category)} | ${categoryStatus(category, metrics)} |`);
}

const global = computeMetrics(merged);
const neverLoaded = listSourceFiles('src').filter((path) => !merged.has(path));

const globalPass = (global.lines ?? 0) >= GLOBAL_LINES_GATE && neverLoaded.length === 0;

rows.push(`| **Global** | **${formatPercent(global.lines)}** | ` +
	`**${formatPercent(global.branches)}** | **${formatPercent(global.functions)}** | ` +
	`≥${GLOBAL_LINES_GATE} lines | ${globalPass ?
		'✅' :
		'❌'} |`);

const lines = [
	'<!-- octolens-coverage-report -->',
	'## Coverage report',
	'',
	'| Suite | Lines | Branches | Functions | Thresholds (L/B/F) | Status |',
	'| --- | --- | --- | --- | --- | --- |',
	...rows,
	'',
];

if (neverLoaded.length > 0) {
	lines.push(`⚠️ Source files loaded by no suite: ${neverLoaded.join(', ')}`, '');
}

lines.push('_Per-suite numbers cover only the files that suite loads; the global row ' +
	'merges every suite over all `src/` files. Global branch/function figures are ' +
	'conservative lower bounds (V8 block identifiers differ between suites). E2E runs ' +
	'against the live API and is excluded from aggregation._', '');

const report = lines.join('\n');

console.log(report);

if (outPath) {
	writeFileSync(outPath, report);
}

if (missing.length === CATEGORIES.length) {
	console.error('No coverage data found — run the test:*:cov scripts first.');
	process.exit(1);
}

if (!globalPass) {
	console.error(`Coverage gate failed: global lines ${formatPercent(global.lines)} ` +
		`(gate: ${GLOBAL_LINES_GATE}%), ${neverLoaded.length} file(s) never loaded.`);
	process.exit(1);
}
