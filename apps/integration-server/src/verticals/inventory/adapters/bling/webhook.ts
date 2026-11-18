/**
 * Bling webhook verification + parsing.
 *
 * Signing: HMAC-SHA256 over the raw JSON body using the application's
 *   client_secret as the key. Bling sends the digest in the header:
 *     X-Bling-Signature-256: sha256=<hex>
 *
 * Payload envelope:
 *   {
 *     "eventId": "<uuid>",
 *     "date": "<ISO8601>",
 *     "version": 1,
 *     "event": "<resource>.<action>",  e.g. "product.created"
 *     "companyId": 123,
 *     "data": { ... }
 *   }
 *
 * Supported resources (as of Bling API v3):
 *   product, stock, virtual_stock, product_supplier
 *   order (pedido de venda — not inventory, ignored as unknown)
 *   invoice, consumer_invoice (not inventory, ignored)
 *
 * Actions: created | updated | deleted
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-bling-signature-256'
const SIG_PREFIX = 'sha256='

export function verifyBlingWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const rawSig =
      headers[SIG_HEADER] ??
      headers['X-Bling-Signature-256'] ??
      headers['x-bling-signature-256']
    if (!rawSig) return false

    const providedHex = rawSig.startsWith(SIG_PREFIX) ? rawSig.slice(SIG_PREFIX.length) : rawSig
    const expected = createHmac('sha256', secret).update(payload).digest('hex')

    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(providedHex.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'product.created': { resourceType: 'products', action: 'created' },
  'product.updated': { resourceType: 'products', action: 'updated' },
  'product.deleted': { resourceType: 'products', action: 'deleted' },
  'stock.created': { resourceType: 'stock-levels', action: 'created' },
  'stock.updated': { resourceType: 'stock-levels', action: 'updated' },
  'stock.deleted': { resourceType: 'stock-levels', action: 'deleted' },
  'virtual_stock.created': { resourceType: 'stock-levels', action: 'created' },
  'virtual_stock.updated': { resourceType: 'stock-levels', action: 'updated' },
  'virtual_stock.deleted': { resourceType: 'stock-levels', action: 'deleted' },
  'product_supplier.created': { resourceType: 'suppliers', action: 'created' },
  'product_supplier.updated': { resourceType: 'suppliers', action: 'updated' },
  'product_supplier.deleted': { resourceType: 'suppliers', action: 'deleted' },
}

export function parseBlingWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const eventId = String(payload['eventId'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? data['ID'] ?? '')
  const mapped = EVENT_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [{
    id: eventId || `bling:${event}:${resourceId}`,
    platform: 'bling',
    type: event,
    resourceType: mapped.resourceType,
    action: mapped.action,
    resourceId,
    payload,
  }]
}

export const BlingWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBlingWebhook,
  parseWebhookEvents: parseBlingWebhookEvents,
}
