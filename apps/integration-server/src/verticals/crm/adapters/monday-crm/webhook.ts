import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verifies a Monday.com webhook using HMAC-SHA256.
 * Monday sends the signature in the `x-monday-signature` header as a hex
 * digest of the raw request body.
 */
export function verifyMondayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-monday-signature'] ?? headers['X-Monday-Signature']
  if (!signature) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export function parseMondayWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = payload['event'] as Record<string, unknown> | undefined
  const eventType = String(event?.['type'] ?? payload['type'] ?? 'unknown').toLowerCase()
  const pulseId = String(event?.['pulseId'] ?? event?.['itemId'] ?? 'unknown')
  const boardId = String(event?.['boardId'] ?? 'unknown')

  return [{
    platform: 'monday-crm',
    type: eventType,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId: pulseId,
    tenantId: boardId !== 'unknown' ? boardId : undefined,
    payload,
  }]
}

export const mondayCrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyMondayWebhook,
  parseWebhookEvents: parseMondayWebhookEvents,
}
