/**
 * iQmetrix webhook stubs.
 *
 * iQmetrix does not publicly document a webhook/push-notification mechanism
 * with HMAC or JWT signing for third-party retail integrations. Inventory
 * change notifications are delivered via polling the Availability API or
 * through the DataConnect reporting layer.
 *
 * This file provides no-op stubs so the adapter satisfies the InventoryAdapter
 * interface.  If iQmetrix adds a signed webhook scheme in the future, implement
 * verifyIqmetrixWebhook using the documented signing algorithm.
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Always returns false — iQmetrix does not define HMAC/JWT webhook signing.
 * Do not call this in production; use polling instead.
 */
export function verifyIqmetrixWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return false
}

/**
 * No-op parser — returns an empty array.
 * iQmetrix does not publish a real-time event stream for retail partners.
 */
export function parseIqmetrixWebhookEvents(
  _payload: Record<string, unknown>,
): WebhookEvent[] {
  return []
}

export const IqmetrixWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyIqmetrixWebhook,
  parseWebhookEvents: parseIqmetrixWebhookEvents,
}
