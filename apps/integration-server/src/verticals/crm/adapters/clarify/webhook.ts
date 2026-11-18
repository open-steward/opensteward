/**
 * Clarify webhooks — not yet available as of 2025.
 * The platform docs state "webhooks are coming soon".
 *
 * This stub satisfies the CrmAdapter interface.
 * Once Clarify launches webhooks this module should be updated with
 * their signature verification scheme and event payload shape.
 */
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // No webhook signature scheme documented yet.
  return true
}

export function parseWebhookEvents(
  _payload: Record<string, unknown>,
): WebhookEvent[] {
  // No webhook events yet.
  return []
}

export const clarifyWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
