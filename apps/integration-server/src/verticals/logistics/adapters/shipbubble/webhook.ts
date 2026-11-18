import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'

/**
 * Verify a Shipbubble webhook delivery.
 *
 * Shipbubble signs the raw request body with HMAC-SHA512 using the account
 * secret key and sends the hex digest in the `x-ship-signature` header.
 */
function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-ship-signature'] ?? ''
  try {
    const computed = createHmac('sha512', secret).update(payload).digest('hex')
    const a = Buffer.from(computed)
    const b = Buffer.from(signature)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Parse a Shipbubble webhook payload into canonical WebhookEvents.
 *
 * Shipbubble posts shipment status updates. The payload structure mirrors
 * the shipment object returned by GET /v1/shipping/labels.
 */
function parseWebhookEvents(payload: Record<string, unknown>): Array<{
  platform: string
  type: string
  resourceType: string
  action: string
  resourceId?: string
  payload: Record<string, unknown>
}> {
  const data = (payload['data'] ?? payload) as Record<string, unknown>
  const orderId = String(data['order_id'] ?? '')
  const status = String(data['status'] ?? '')

  const actionMap: Record<string, string> = {
    pending: 'created',
    confirmed: 'updated',
    picked_up: 'updated',
    in_transit: 'updated',
    completed: 'updated',
    cancelled: 'cancelled',
  }

  const action = actionMap[status] ?? 'updated'

  if (!orderId) return []

  return [
    {
      platform: 'shipbubble',
      type: `shipment.${status}`,
      resourceType: 'shipment',
      action,
      resourceId: orderId,
      payload,
    },
  ]
}

export const shipbubbleWebhook: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
