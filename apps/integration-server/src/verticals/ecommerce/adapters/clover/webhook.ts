/**
 * Clover webhook verification and event parsing.
 *
 * Clover webhook verification uses a shared verification token that
 * must match the `verificationCode` query parameter sent by Clover
 * during subscription setup, plus HMAC-SHA256 for event payloads.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyCloverWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-clover-hmac'] ??
      headers['X-Clover-Hmac']
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

// ── Event type → canonical mapping ──────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  items: 'products',
  categories: 'collections',
  customers: 'customers',
  orders: 'orders',
  payments: 'transactions',
  refunds: 'refunds',
  inventory: 'inventory_levels',
  discounts: 'discounts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  CREATE: 'created',
  UPDATE: 'updated',
  DELETE: 'deleted',
}

/**
 * Parse a Clover webhook delivery into canonical events.
 *
 * Clover sends: `{ appId, merchants: { merchantId: [{ type, objectId, ts }] } }`
 */
export function parseCloverWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const merchants = payload['merchants'] as Record<string, unknown[]> | undefined
  if (!merchants) return []

  const events: WebhookEvent[] = []

  for (const [merchantId, entries] of Object.entries(merchants)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const e = entry as Record<string, unknown>
      const type = (e['type'] as string) ?? ''
      // Clover type format: "CREATE", "UPDATE", "DELETE" with objectId like "items/{id}"
      const objectId = (e['objectId'] as string) ?? ''
      const parts = objectId.split('/')
      const resourceKey = parts[0] ?? ''
      const resourceId = parts[1] ?? objectId

      const resourceType = RESOURCE_MAP[resourceKey] ?? 'unknown'
      const action = ACTION_MAP[type] ?? 'unknown'

      events.push({
        platform: 'clover',
        type: `${resourceType}.${action}`,
        resourceType,
        action,
        resourceId,
        tenantId: merchantId,
        payload: e,
      })
    }
  }

  return events
}

export const cloverWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyCloverWebhook,
  parseWebhookEvents: parseCloverWebhookEvents,
}
