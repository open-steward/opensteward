import type { WebhookEvent } from '../../schema/webhook'

/**
 * Vitally webhook verification and event parsing.
 *
 * Vitally does not document a public webhook signature scheme in its REST API
 * docs. verifyWebhook returns true (pass-through) until an HMAC scheme is
 * documented; callers can guard at the network / IP-allowlist level instead.
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

export const vitallyWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
