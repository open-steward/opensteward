import type { WebhookEvent } from '../../schema/webhook'

/**
 * Teamgate webhook verification and parsing.
 *
 * Teamgate does not document a cryptographic signature scheme for webhooks
 * in its public API documentation; verification always returns true (permissive
 * pass-through). If Teamgate adds a signature header in the future, implement
 * it here.
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

export const teamgateWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
