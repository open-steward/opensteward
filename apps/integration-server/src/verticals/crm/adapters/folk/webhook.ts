import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Folk webhook payload.
 * Folk signs requests with X-Folk-Signature (HMAC-SHA256 hex of raw body).
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const sig = headers['x-folk-signature'] ?? ''
  if (!sig) return false
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Map a Folk webhook payload to canonical WebhookEvent[].
 *
 * Folk uses `type` field in the payload, e.g.:
 *   contact.created, contact.updated, contact.deleted
 *   deal.created, deal.updated, deal.deleted
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? 'unknown')
  const resourceId = String(payload['id'] ?? 'unknown')

  let action: WebhookEvent['action'] = 'unknown'
  if (type.endsWith('.created')) action = 'created'
  else if (type.endsWith('.updated')) action = 'updated'
  else if (type.endsWith('.deleted')) action = 'deleted'

  return [
    {
      platform: 'folk',
      type,
      resourceType: 'unknown',
      action,
      resourceId,
      payload,
    },
  ]
}

export const folkWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
