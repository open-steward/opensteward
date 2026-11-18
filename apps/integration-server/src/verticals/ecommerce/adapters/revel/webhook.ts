/**
 * Revel Systems webhook verification and event parsing.
 *
 * Revel webhooks use HMAC-SHA256 verification with the signing secret.
 * The signature is sent in the `X-Revel-Signature` header (base64).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyRevelWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-revel-signature'] ??
      headers['X-Revel-Signature']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret)
      .update(payload)
      .digest('base64')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event type -> canonical mapping ──────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  Product: 'products',
  ProductCategory: 'collections',
  Customer: 'customers',
  Order: 'orders',
  Payment: 'transactions',
  OrderRefund: 'refunds',
  Inventory: 'inventory_levels',
  Discount: 'discounts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
}

/**
 * Parse a Revel webhook delivery into canonical events.
 *
 * Revel sends: `{ event_type, resource_type, resource_id, establishment_id, data }`
 */
export function parseRevelWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const resourceType = (payload['resource_type'] as string) ?? ''
  const eventType = (payload['event_type'] as string) ?? ''
  const resourceId = String(payload['resource_id'] ?? '')
  const establishmentId = payload['establishment_id'] as string | undefined

  const canonicalResource = RESOURCE_MAP[resourceType] ?? 'unknown'
  const action = ACTION_MAP[eventType] ?? 'unknown'

  if (!resourceId) return []

  return [
    {
      platform: 'revel',
      type: `${canonicalResource}.${action}`,
      resourceType: canonicalResource,
      action,
      resourceId,
      tenantId: establishmentId,
      payload,
    },
  ]
}

export const revelWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyRevelWebhook,
  parseWebhookEvents: parseRevelWebhookEvents,
}
