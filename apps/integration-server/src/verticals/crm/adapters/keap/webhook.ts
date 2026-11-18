import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Keap webhook using HMAC-SHA256.
 *
 * During webhook setup Keap sends the secret in the `X-Hook-Secret` header.
 * For subsequent events the signature is in `X-Keap-Signature`.
 */
export function verifyKeapWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-keap-signature'] ?? headers['X-Keap-Signature']
  if (!signature) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    )
  } catch {
    return false
  }
}

export function parseKeapWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventKey = String(payload['event_key'] ?? 'unknown')
  const resourceId = String(
    (payload['object_keys'] as Array<Record<string, unknown>> | undefined)?.[0]?.['id'] ??
    payload['id'] ??
    'unknown',
  )

  return [{
    platform: 'keap',
    type: eventKey,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId,
    payload,
  }]
}

export const keapWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyKeapWebhook,
  parseWebhookEvents: parseKeapWebhookEvents,
}
