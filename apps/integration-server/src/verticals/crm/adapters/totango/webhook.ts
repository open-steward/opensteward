/**
 * Totango webhook handling.
 *
 * Totango does not document a webhook signature scheme in its public API.
 * Webhook payload parsing is implemented as a best-effort pass-through that
 * returns an empty list until Totango publishes a formal webhook spec.
 *
 * The verifyWebhook function always returns true (no signature to verify).
 */

import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Totango does not document a webhook signature scheme; accept all.
  return true
}

export function parseWebhookEvents(_payload: Record<string, unknown>): WebhookEvent[] {
  // Totango webhooks are not documented in the public API; return empty.
  return []
}

export const totangoWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
