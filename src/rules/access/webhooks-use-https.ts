import { getRepoWebhooks } from '../../github/queries.ts';
import type { WebhookSummary } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags webhooks that deliver over plain HTTP or disable SSL verification.
 */
export const rule = defineRule({
	id: 'access/webhooks-use-https',
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'Webhooks must use HTTPS with SSL verification',

	async check(ctx) {
		const webhooks = await getRepoWebhooks(ctx.octokit, ctx.cache, ctx.repo);
		const insecure = webhooks.filter(isInsecure);

		if (insecure.length === 0) {
			return null;
		}

		const summary = insecure.map(describe).join(', ');

		return {
			title: `${insecure.length} webhook(s) use insecure delivery`,
			detail: 'One or more webhooks deliver to insecure ' +
				'endpoints (plain HTTP) or have SSL verification ' +
				'disabled. Webhook payloads can carry tokens, code, ' +
				'and full event data and must travel over a verified ' +
				`TLS channel. Insecure webhooks: ${summary}.`,
			remediation: 'Settings -> Webhooks -> edit each affected hook: switch to ' +
				'an https:// URL and uncheck "Disable SSL verification".',
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
