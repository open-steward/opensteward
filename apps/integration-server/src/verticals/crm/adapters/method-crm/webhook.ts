import type { WebhookEvent } from '../../schema/webhook'

/**
 * Method CRM webhook support.
 *
 * Method CRM does not currently document a webhook signature verification
 * scheme in its public API. verifyWebhook always returns true (open).
 * parseWebhookEvents returns an empty array (no normalisation implemented).
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

export function parseWebhookEvents(_payload: Record<string, unknown>): WebhookEvent[] {
  return []
}

export const methodUcrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
