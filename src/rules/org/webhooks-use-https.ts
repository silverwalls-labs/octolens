import { getOrgWebhooks } from '../../github/queries.ts';
import type { WebhookSummary } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisation webhooks that deliver over plain HTTP or
 * disable SSL verification.
 */
export const rule = defineOrgRule({
	id: 'org/webhooks-use-https',
	defaultSeverity: 'medium',
	summary: 'Organisation webhooks must use HTTPS with SSL verification',

	async check(ctx) {
		const inventory = await getOrgWebhooks(ctx.octokit, ctx.cache, ctx.org);

		if (!inventory.checked) {
			return skip('could not list organisation webhooks (no permission)');
		}

		const insecure = inventory.hooks.filter(isInsecure);

		if (insecure.length === 0) {
			return null;
		}

		const summary = insecure.map(describe).join(', ');

		return {
			title: `${insecure.length} organisation webhook(s) use insecure delivery`,
			detail: 'One or more organisation webhooks deliver to insecure endpoints ' +
				'(plain HTTP) or have SSL verification disabled. Organisation hooks receive ' +
				'events for every repository, so a single insecure endpoint exposes ' +
				`organisation-wide activity. Insecure webhooks: ${summary}.`,
			remediation: 'Organization Settings -> Webhooks -> edit each affected ' +
				'hook: switch to an https:// URL and uncheck "Disable SSL verification".',
		};
	},
});

/**
 * Check whether a webhook uses plain HTTP or skips SSL verification.
 *
 * @param hook - Webhook to inspect.
 * @returns    True for insecure delivery settings.
 */
function isInsecure(hook: WebhookSummary): boolean {
	return hook.url.startsWith('http://') || hook.insecureSsl;
}

/**
 * Format a webhook for the finding detail.
 *
 * @param hook - Webhook to inspect.
 * @returns    The formatted description.
 */
function describe(hook: WebhookSummary): string {
	const reason = hook.insecureSsl ?
		'ssl verification disabled' :
		'plain http';

	return `#${hook.id} (${reason})`;
}
