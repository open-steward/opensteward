/**
 * pandago webhook signature verification and event parsing.
 *
 * pandago signs outbound callback requests using HMAC-SHA256. The digest is
 * delivered in the `X-Signature-SHA256` header as a hex string. The signed
 * payload is the raw request body bytes.
 *
 * Supported callback types:
 *   1. Order status  — POST to the configured callback URL.
 *      Fields: order_id, client_order_id, status, cancellation_reason, ...
 *   2. Courier location — POST to the configured callback-location URL.
 *      Fields: order_id, latitude, longitude, updated_at
 *   3. Refund — POST to the configured callback-refund URL.
 *      Fields: order_id, refund_id, type, total_amount, reason, owner, ...
 *
 * Reference: https://on-demand-rider-docs.deliveryhero.io/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

// ─── Signature verification ─────────────────────────────────────────────────

export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = (headers['x-signature-sha256'] ?? '').toLowerCase().trim()
  if (!signature || !secret) return false

  try {
    const computed = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(computed, 'utf8')
    const b = Buffer.from(signature, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ─── Event parsing ──────────────────────────────────────────────────────────

type CanonicalAction = WebhookEvent['action']

function mapAction(status: string): CanonicalAction {
  switch (status) {
    case 'NEW':
    case 'RECEIVED':
      return 'created'
    case 'CANCELLED':
    case 'RETURNED_TO_VENDOR':
      return 'cancelled'
    default:
      return 'updated'
  }
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // Detect callback type from payload shape.
  if (typeof payload['refund_id'] === 'string') {
    // Refund callback
    const orderId = payload['order_id'] != null ? String(payload['order_id']) : undefined
    return [
      {
        platform: 'pandago',
        type: 'refund',
        resourceType: 'shipment',
        action: 'updated',
        resourceId: orderId,
        payload,
      },
    ]
  }

  if (
    typeof payload['latitude'] === 'number' ||
    typeof payload['longitude'] === 'number'
  ) {
    // Courier location callback — not a shipment state change
    const orderId = payload['order_id'] != null ? String(payload['order_id']) : undefined
    return [
      {
        platform: 'pandago',
        type: 'courier.location',
        resourceType: 'shipment',
        action: 'updated',
        resourceId: orderId,
        payload,
      },
    ]
  }

  // Default: order status callback
  const status =
    typeof payload['status'] === 'string' ? payload['status'] : ''
  const orderId =
    payload['order_id'] != null ? String(payload['order_id']) : undefined

  return [
    {
      platform: 'pandago',
      type: status || 'order.status',
      resourceType: 'shipment',
      action: mapAction(status),
      resourceId: orderId,
      payload,
    },
  ]
}

export const pandagoWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
