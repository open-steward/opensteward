/**
 * Vend POS (Lightspeed Retail X-Series) webhook verification + parsing.
 *
 * Signature header:  X-Signature
 * Header format:     signature=<hex>,algorithm=HMAC-SHA256
 * Signing key:       OAuth application client_secret
 * Algorithm:         HMAC-SHA256 over the raw request body
 * Encoding:          Payloads are application/x-www-form-urlencoded UTF-8
 *
 * Supported event types (Lightspeed docs, 2024):
 *   product.update    — product created or modified
 *   inventory.update  — stock levels changed
 *   consignment.send  — stock transfer dispatched
 *   consignment.receive — consignment stock received
 *   sale.update       — sale created or modified (not mapped)
 *   customer.update   — customer changed (not mapped)
 *   register_closure.create — register closed (not mapped)
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/**
 * Extract the hex signature from the X-Signature header value.
 * Format: "signature=<hex>,algorithm=HMAC-SHA256"
 */
function extractSig(headerValue: string): string | undefined {
  const match = headerValue.match(/signature=([0-9a-f]+)/i)
  return match?.[1]
}

/**
 * Verify the Lightspeed webhook X-Signature header.
 *
 * @param payload  Raw request body Buffer.
 * @param headers  Request headers (any casing; keys are compared lower-cased).
 * @param secret   OAuth application client_secret used as the HMAC key.
 */
export function verifyVendWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const raw =
      headers['x-signature'] ??
      headers['X-Signature'] ??
      Object.entries(headers).find(([k]) => k.toLowerCase() === 'x-signature')?.[1]

    if (!raw) return false

    const provided = extractSig(raw)
    if (!provided) return false

    const expected = createHmac('sha256', secret).update(payload).digest('hex')

    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Map Lightspeed event types to OpenSteward resource + action pairs.
 * Only inventory-vertical events are mapped; others yield 'unknown'.
 */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'product.update': { resourceType: 'products', action: 'updated' },
  'inventory.update': { resourceType: 'stock-levels', action: 'updated' },
  'consignment.send': { resourceType: 'stock-transfers', action: 'updated' },
  'consignment.receive': { resourceType: 'purchase-orders', action: 'received' },
}

/**
 * Parse a Lightspeed webhook delivery into OpenSteward WebhookEvent(s).
 *
 * Vend wraps payloads as:
 *   { root: { type, domain_prefix, retailer_id, payload: { ... } } }
 */
export function parseVendWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const root = (payload['root'] as Record<string, unknown> | undefined) ?? payload
  const type = String(root['type'] ?? '')
  const inner = (root['payload'] as Record<string, unknown> | undefined) ?? {}
  const id = String(inner['id'] ?? inner['ID'] ?? root['retailer_id'] ?? '')
  const mapped = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `vend-pos:${type}:${id}`,
      platform: 'vend-pos',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId: id,
      payload,
    },
  ]
}

export const VendWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyVendWebhook,
  parseWebhookEvents: parseVendWebhookEvents,
}
