/**
 * Wati webhook handling.
 *
 * Wati does not document a request-signing scheme for webhook delivery —
 * no HMAC header is added to inbound webhook requests. `verifyWebhook`
 * therefore accepts all payloads (callers may still restrict by IP or
 * shared secret in the URL path).
 *
 * Event shape (message received):
 *   { eventType: "message", waId, text, type, ... }
 *
 * Docs: https://docs.wati.io/reference/introduction-1
 */
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Wati does not sign webhook requests; accept all inbound payloads.
  return true
}

export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType = typeof payload['eventType'] === 'string'
    ? payload['eventType']
    : 'unknown'
  const waId = typeof payload['waId'] === 'string' ? payload['waId'] : ''

  return [
    {
      platform: 'wati',
      type: `message.${eventType}`,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId: waId,
      payload,
    },
  ]
}

export const watiWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
