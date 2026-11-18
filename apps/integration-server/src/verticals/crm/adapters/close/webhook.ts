import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Close webhook using HMAC-SHA256.
 * Close sends the signature in the `x-close-signature` header.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-close-signature'] ?? headers['X-Close-Signature']
  if (!signature) return false
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
  } catch {
    return false
  }
}

/**
 * Parse a Close webhook payload into canonical WebhookEvent(s).
 * Close sends a single event per request with `event` and `object_type` fields.
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? 'unknown')
  const resourceId = String(
    (payload['data'] as Record<string, unknown> | undefined)?.['id'] ?? 'unknown',
  )

  let action: WebhookEvent['action'] = 'unknown'
  if (event.endsWith('.created')) action = 'created'
  else if (event.endsWith('.updated')) action = 'updated'
  else if (event.endsWith('.deleted')) action = 'deleted'

  return [
    {
      platform: 'close',
      type: event,
      resourceType: 'unknown',
      action,
      resourceId,
      payload,
    },
  ]
}

export const closeWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
