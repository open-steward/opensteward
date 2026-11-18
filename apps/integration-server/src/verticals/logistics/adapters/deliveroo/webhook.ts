import { createHmac, timingSafeEqual } from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Deliveroo webhook signature verification.
 *
 * Deliveroo signs each webhook callback using HMAC-SHA256. The signed string is
 * constructed as:
 *
 *   <X-Deliveroo-Sequence-Guid> + <separator> + <raw request body>
 *
 * where separator is a single space " " for all webhook types (or " \n " for
 * legacy POS webhooks — new_order / cancel_order). The resulting hex digest is
 * sent in the `X-Deliveroo-Hmac-Sha256` header.
 *
 * Reference: https://api-docs.deliveroo.com/docs/securing-webhooks
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-deliveroo-hmac-sha256'] ?? ''
  const guid = headers['x-deliveroo-sequence-guid'] ?? ''

  if (!signature || !guid) return false

  // Detect legacy POS events by inspecting the body for new_order / cancel_order
  const bodyStr = payload.toString('utf8')
  let eventType = ''
  try {
    const parsed = JSON.parse(bodyStr) as Record<string, unknown>
    eventType = typeof parsed['type'] === 'string' ? parsed['type'] : ''
  } catch {
    // non-JSON body — treat as non-legacy
  }

  const isLegacyPos = eventType === 'new_order' || eventType === 'cancel_order'
  const separator = isLegacyPos ? ' \n ' : ' '

  const expected = createHmac('sha256', secret)
    .update(guid + separator, 'utf8')
    .update(payload)
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected, 'utf8'),
    )
  } catch {
    return false
  }
}

/**
 * Parse a Deliveroo webhook callback into canonical WebhookEvents.
 *
 * Supported event types (order status):
 *   pending, placed, accepted, confirmed, rider_assigned, rider_arrived,
 *   rider_in_transit, rider_nearby, delivered, canceled, rejected,
 *   undeliverable, new_order (legacy POS), cancel_order (legacy POS)
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const status = String(payload['status'] ?? payload['type'] ?? '')
  const orderId =
    payload['order_id'] != null
      ? String(payload['order_id'])
      : payload['id'] != null
        ? String(payload['id'])
        : undefined

  type CanonicalAction = WebhookEvent['action']

  let action: CanonicalAction
  switch (status.toLowerCase()) {
    case 'placed':
    case 'pending':
    case 'new_order':
      action = 'created'
      break
    case 'canceled':
    case 'cancelled':
    case 'rejected':
    case 'undeliverable':
    case 'cancel_order':
      action = 'cancelled'
      break
    default:
      action = 'updated'
  }

  return [
    {
      platform: 'deliveroo',
      type: status,
      resourceType: 'order',
      action,
      resourceId: orderId,
      payload,
    },
  ]
}

export const deliverooWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
