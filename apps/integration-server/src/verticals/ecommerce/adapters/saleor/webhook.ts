/**
 * Saleor webhook verification and event parsing.
 *
 * Verification: Saleor signs the raw request body with HMAC-SHA256 and
 * sends the base64 signature in the `saleor-signature` header. Compare
 * using `timingSafeEqual`.
 *
 * Event parsing: Saleor sends the event type in the `saleor-event` header
 * (UPPER_SNAKE, e.g. `PRODUCT_CREATED`). Map to canonical
 * `{ resourceType, action }`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'
import { WEBHOOK_SIGNATURE_HEADER } from './constants'

export function verifySaleorWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig = headers[WEBHOOK_SIGNATURE_HEADER] ?? headers['Saleor-Signature']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Topic → canonical mapping ───────────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  product_variant: 'variants',
  collection: 'collections',
  warehouse: 'locations',
  order: 'orders',
  customer: 'customers',
  fulfillment: 'fulfillments',
  transaction: 'transactions',
  voucher: 'discounts',
  stock: 'inventory_levels',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
}

function mapTopic(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Saleor event format: "PRODUCT_CREATED", "ORDER_UPDATED", etc.
  const lower = eventType.toLowerCase()
  // Split on the last underscore — the action is always the last segment
  const lastUnderscore = lower.lastIndexOf('_')
  if (lastUnderscore === -1) {
    return { resourceType: 'unknown', action: 'unknown' }
  }
  const resource = lower.slice(0, lastUnderscore)
  const verb = lower.slice(lastUnderscore + 1)
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a Saleor webhook delivery into canonical events. Saleor delivers
 * one event per HTTP request.
 */
export function parseSaleorWebhookEvents(
  payload: Record<string, unknown>,
  eventHeader?: string,
): WebhookEvent[] {
  const eventType = eventHeader ?? (payload['__event'] as string | undefined) ?? ''
  const { resourceType, action } = eventType
    ? mapTopic(eventType)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'saleor',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const saleorWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifySaleorWebhook,
  parseWebhookEvents: parseSaleorWebhookEvents,
}
