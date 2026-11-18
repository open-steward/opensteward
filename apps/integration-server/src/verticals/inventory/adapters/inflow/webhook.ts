/**
 * Cin7 Core webhook verification + parsing.
 * HMAC-SHA256 over body, hex, header X-Cin7-Signature.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-inflow-signature', 'X-Inflow-Signature']

export function verifyInflowWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    for (const name of SIG_HEADERS) {
      const provided = headers[name] ?? headers[name.toLowerCase()]
      if (!provided) continue
      const b = Buffer.from(provided.trim(), 'utf8')
      if (a.length !== b.length) continue
      if (timingSafeEqual(a, b)) return true
    }
    return false
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'Stock.OnHandChanged': { resourceType: 'stock-levels', action: 'updated' },
  'Product.Modified': { resourceType: 'products', action: 'updated' },
  'Product.Added': { resourceType: 'products', action: 'created' },
  'PurchaseOrder.Created': { resourceType: 'purchase-orders', action: 'created' },
  'PurchaseOrder.Received': { resourceType: 'purchase-orders', action: 'received' },
  'StockAdjustment.Posted': { resourceType: 'stock-adjustments', action: 'adjusted' },
}

export function parseInflowWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['Type'] ?? payload['type'] ?? '')
  const data = (payload['Data'] as Record<string, unknown> | undefined) ?? {}
  const id = String(data['ID'] ?? data['id'] ?? '')
  const mapped = ACTION_MAP[type] ?? { resourceType: 'unknown' as WebhookResourceType, action: 'unknown' as WebhookAction }
  return [{
    id: `cin7-core:${type}:${id}`,
    platform: 'inflow',
    type,
    resourceType: mapped.resourceType,
    action: mapped.action,
    resourceId: id,
    payload,
  }]
}

export const InflowWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyInflowWebhook,
  parseWebhookEvents: parseInflowWebhookEvents,
}
