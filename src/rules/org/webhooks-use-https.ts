import { getOrgWebhooks } from '../../github/queries.ts';
import type { WebhookSummary } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/webhooks-use-https';

const DETAIL = 'One or more organisation webhooks deliver to insecure endpoints ' +
	'(plain HTTP) or have SSL verification disabled. Organisation hooks receive ' +
	'events for every repository, so a single insecure endpoint exposes ' +
	'organisation-wide activity.';

const REMEDIATION = 'Organization Settings -> Webhooks -> edit each affected ' +
	'hook: switch to an https:// URL and uncheck "Disable SSL verification".';

/**
 * Flags organisation webhooks that deliver over plain HTTP or
 * disable SSL verification.
 */
export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'medium',
	summary: 'Organisation webhooks must use HTTPS with SSL verification',
	docs: RULE_ID,

	async check(ctx) {
		const inventory = await getOrgWebhooks(ctx.octokit, ctx.cache, ctx.org);

		if (!inventory.checked) {
			return skip('could not list organisation webhooks (no permission)');
		}

		const insecure = inventory.hooks.filter(isInsecure);

		if (insecure.length === 0) {
			return [];
		}

		const summary = insecure.map(describe).join(', ');
		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			org: ctx.org,
			title: `${insecure.length} organisation webhook(s) use insecure delivery`,
			detail: `${DETAIL} Insecure webhooks: ${summary}.`,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};

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
