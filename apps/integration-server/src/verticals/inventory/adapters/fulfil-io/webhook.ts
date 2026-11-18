/**
 * Fulfil.io webhook verification + event parsing.
 *
 * Fulfil signs webhook payloads with HMAC-SHA256 and sends the Base64-encoded
 * digest in the X-Fulfil-Hmac-SHA256 header.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-fulfil-hmac-sha256'

export function verifyFulfilWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(expected, 'utf8')
    const provided =
      headers[SIG_HEADER] ??
      headers['X-Fulfil-Hmac-SHA256'] ??
      headers[SIG_HEADER.toLowerCase()]
    if (!provided) return false
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Fulfil webhook event types observed in the wild.
 * The topic field maps to resource + action.
 */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'product.product/create': { resourceType: 'products', action: 'created' },
  'product.product/write': { resourceType: 'products', action: 'updated' },
  'stock.move/create': { resourceType: 'stock-levels', action: 'created' },
  'stock.move/write': { resourceType: 'stock-levels', action: 'updated' },
  'purchase.purchase/create': { resourceType: 'purchase-orders', action: 'created' },
  'purchase.purchase/write': { resourceType: 'purchase-orders', action: 'updated' },
  'stock.inventory/write': { resourceType: 'stock-adjustments', action: 'adjusted' },
  'stock.shipment.internal/write': { resourceType: 'stock-transfers', action: 'updated' },
}

export function parseFulfilWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // Fulfil webhook body: { id, topic, data: { id, ... } }
  const topic = String(payload['topic'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? payload['id'] ?? '')
  const mapped = ACTION_MAP[topic] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [{
    id: `fulfil-io:${topic}:${resourceId}`,
    platform: 'fulfil-io',
    type: topic,
    resourceType: mapped.resourceType,
    action: mapped.action,
    resourceId,
    payload,
  }]
}

export const FulfilWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFulfilWebhook,
  parseWebhookEvents: parseFulfilWebhookEvents,
}
