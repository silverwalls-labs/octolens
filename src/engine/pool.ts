/**
 * Run a worker over every item of an async source with bounded concurrency.
 *
 * Spawns `concurrency` loops that pull from a single shared iterator, so at
 * most `concurrency` workers are in flight at any time and items are
 * consumed in source order. Resolves when the source is exhausted and all
 * workers have finished. A worker rejection propagates and stops intake —
 * callers that want per-item error tolerance should catch inside `worker`.
 *
 * @param    source      - Async iterable of work items (e.g. a paginated listing).
 * @param    worker      - Async function invoked once per item.
 * @param    concurrency - Maximum number of workers in flight (min 1).
 * @template T           - Type of the work items.
 */
export async function runPool<T>(
	source: AsyncIterable<T>,
	worker: (item: T) => Promise<void>,
	concurrency: number,
): Promise<void> {
	const iterator = source[Symbol.asyncIterator]();
	const width = Math.max(1, Math.floor(concurrency));

	const loops = Array.from({ length: width }, () => pullLoop(iterator, worker));

	await Promise.all(loops);
}

/**
 * Single worker loop: pull items from the shared iterator until exhausted.
 *
 * @param    iterator - Shared iterator the workers pull from.
 * @param    worker   - Async function invoked once per item.
 * @template T        - Type of the work items.
 */
async function pullLoop<T>(
	iterator: AsyncIterator<T>,
	worker: (item: T) => Promise<void>,
): Promise<void> {
	for (;;) {
		const next = await iterator.next();

		if (next.done) {
			return;
		}

		await worker(next.value);
	}
}
