/**
 * Picqer webhook verification + parsing.
 *
 * Signing: HMAC-SHA256 over the raw body, result base64-encoded.
 * Header: X-Picqer-Signature
 * Reference: https://picqer.com/en/api/webhooks
 *
 * PHP equivalent:
 *   base64_encode(hash_hmac('sha256', $body, $secret, true))
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-picqer-signature'

export function verifyPicqerWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const provided = headers[SIG_HEADER] ?? headers['X-Picqer-Signature'] ?? ''
    if (!provided) return false
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Picqer webhook event types mapped to inventory resource types + actions. */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'products.free_stock_changed': { resourceType: 'stock-levels', action: 'updated' },
  'products.stock_changed': { resourceType: 'stock-levels', action: 'updated' },
  'products.stock_on_location_changed': { resourceType: 'stock-levels', action: 'updated' },
  'receipts.completed': { resourceType: 'purchase-orders', action: 'received' },
  'receipts.product_received': { resourceType: 'purchase-orders', action: 'received' },
}

export function parsePicqerWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const id = String(data['idproduct'] ?? data['id'] ?? data['idpurchaseorder'] ?? '')
  const mapped = ACTION_MAP[event] ?? { resourceType: 'unknown' as WebhookResourceType, action: 'unknown' as WebhookAction }
  return [{
    id: `picqer:${event}:${id}`,
    platform: 'picqer',
    type: event,
    resourceType: mapped.resourceType,
    action: mapped.action,
    resourceId: id,
    payload,
  }]
}

export const PicqerWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPicqerWebhook,
  parseWebhookEvents: parsePicqerWebhookEvents,
}

