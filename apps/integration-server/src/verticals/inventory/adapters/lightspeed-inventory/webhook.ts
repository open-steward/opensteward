/**
 * Lightspeed Retail (X-Series) webhook verification + event parsing.
 *
 * Verification:
 *   Header: X-Signature: signature=<hex>,algorithm=HMAC-SHA256
 *   Key: application client_secret
 *   Body: raw request body bytes (HMAC-SHA256)
 *
 * Docs: https://x-series-api.lightspeedhq.com/docs/webhooks
 *
 * Supported event types:
 *   product.update      — product created or changed
 *   inventory.update    — stock level changed
 *   consignment.send    — consignment sent (stock order / transfer sent)
 *   consignment.receive — consignment received
 *   sale.update         — sale created/modified (ignored here — outside scope)
 *   customer.update     — customer record changed (ignored)
 *   register_closure.create — register closed (ignored)
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/**
 * Parse the X-Signature header into its signature and algorithm parts.
 * Format: "signature=<hex>,algorithm=HMAC-SHA256"
 */
function parseXSignature(header: string): { signature: string; algorithm: string } | undefined {
  const parts: Record<string, string> = {}
  for (const chunk of header.split(',')) {
    const [k, v] = chunk.trim().split('=')
    if (k && v) parts[k.toLowerCase()] = v
  }
  if (!parts['signature']) return undefined
  return { signature: parts['signature'], algorithm: parts['algorithm'] ?? 'HMAC-SHA256' }
}

export function verifyLightspeedWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const rawHeader = headers['x-signature'] ?? headers['X-Signature']
    if (!rawHeader) return false
    const parsed = parseXSignature(rawHeader)
    if (!parsed) return false

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(parsed.signature.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'product.update':       { resourceType: 'products',        action: 'updated' },
  'inventory.update':     { resourceType: 'stock-levels',    action: 'updated' },
  'consignment.send':     { resourceType: 'purchase-orders', action: 'updated' },   // dispatched/sent
  'consignment.receive':  { resourceType: 'purchase-orders', action: 'received' },
}

export function parseLightspeedWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // X-Series webhook body: { "retailer_id": "...", "type": "product.update", "payload": { "id": "..." } }
  const type = String(payload['type'] ?? payload['Type'] ?? '')
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? payload
  const id = String(inner['id'] ?? inner['ID'] ?? '')
  const mapped = EVENT_MAP[type] ?? { resourceType: 'unknown' as WebhookResourceType, action: 'unknown' as WebhookAction }
  return [{
    id: `lightspeed-inventory:${type}:${id}`,
    platform: 'lightspeed-inventory',
    type,
    resourceType: mapped.resourceType,
    action: mapped.action,
    resourceId: id,
    payload,
  }]
}

export const LightspeedWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyLightspeedWebhook,
  parseWebhookEvents: parseLightspeedWebhookEvents,
}
