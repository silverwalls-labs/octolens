import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { runPool } from '../../../src/engine/pool.ts';

describe('runPool', () => {
	test('pool processes every item', async () => {
		const seen: number[] = [];

		async function worker(item: number) {
			seen.push(item);
		}

		await runPool(sourceOf([
			1,
			2,
			3,
			4,
			5,
		]), worker, 2);

		assert.deepEqual([ ...seen ].sort(byNumber), [
			1,
			2,
			3,
			4,
			5,
		]);
	});

	test('pool never exceeds the concurrency bound', async () => {
		let inFlight = 0;
		let maxInFlight = 0;

		async function worker() {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setImmediate(resolve));
			inFlight--;
		}

		await runPool(sourceOf([
			1,
			2,
			3,
			4,
			5,
			6,
			7,
			8,
		]), worker, 3);

		assert.ok(
			maxInFlight <= 3,
			`max in flight was ${maxInFlight}`,
		);
	});

	test('pool handles an empty source', async () => {
		let calls = 0;

		async function worker() {
			calls++;
		}

		await runPool(sourceOf<number>([]), worker, 4);

		assert.equal(calls, 0);
	});

	test('pool clamps concurrency to at least 1', async () => {
		const seen: number[] = [];

		async function worker(item: number) {
			seen.push(item);
		}

		await runPool(sourceOf([ 1, 2 ]), worker, 0);

		assert.deepEqual(seen, [ 1, 2 ]);
	});

	test('worker rejection propagates', async () => {
		async function worker(item: number) {
			if (item === 2) {
				throw new Error('boom');
			}
		}

		await assert.rejects(runPool(sourceOf([
			1,
			2,
			3,
		]), worker, 1), /boom/);
	});
});

async function *sourceOf<T>(items: T[]): AsyncGenerator<T> {
	for (const item of items) {
		yield item;
	}
}

function byNumber(a: number, b: number): number {
	return a - b;
}
