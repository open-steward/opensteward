/**
 * Vendure webhook verification and event parsing.
 *
 * Verification: Vendure's webhook plugin signs the raw request body with
 * HMAC-SHA256 and sends the hex signature in the `x-vendure-hmac-sha256`
 * header. Compare using `timingSafeEqual`.
 *
 * Event parsing: Vendure sends the event type in the payload body
 * (e.g. `ProductEvent`, `OrderStateTransitionEvent`). Map to canonical
 * `{ resourceType, action }`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'
import { WEBHOOK_SIGNATURE_HEADER } from './constants'

export function verifyVendureWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig = headers[WEBHOOK_SIGNATURE_HEADER] ?? headers['X-Vendure-Hmac-Sha256']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// -- Topic -> canonical mapping ----------------------------------------------

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  productvariant: 'variants',
  collection: 'collections',
  stocklocation: 'locations',
  order: 'orders',
  customer: 'customers',
  fulfillment: 'fulfillments',
  promotion: 'discounts',
  stockmovement: 'inventory_levels',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
}

function mapTopic(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Vendure event format: "ProductEvent", "OrderStateTransitionEvent",
  // "ProductVariantCreatedEvent", etc.
  const lower = eventType.toLowerCase().replace(/event$/, '')

  // Try to find action suffix
  for (const [actionKey, actionVal] of Object.entries(ACTION_MAP)) {
    if (lower.endsWith(actionKey)) {
      const resource = lower.slice(0, -actionKey.length)
      if (RESOURCE_MAP[resource]) {
        return { resourceType: RESOURCE_MAP[resource]!, action: actionVal }
      }
    }
  }

  // Fallback: try to match just the resource
  for (const [resourceKey, resourceVal] of Object.entries(RESOURCE_MAP)) {
    if (lower.startsWith(resourceKey)) {
      return { resourceType: resourceVal, action: 'updated' }
    }
  }

  return { resourceType: 'unknown', action: 'unknown' }
}

/**
 * Parse a Vendure webhook delivery into canonical events. Vendure delivers
 * one event per HTTP request.
 */
export function parseVendureWebhookEvents(
  payload: Record<string, unknown>,
  eventHeader?: string,
): WebhookEvent[] {
  const eventType = eventHeader ?? (payload['type'] as string | undefined) ?? ''
  const { resourceType, action } = eventType
    ? mapTopic(eventType)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id'] ?? (payload['entity'] as Record<string, unknown> | undefined)?.['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'vendure',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const vendureWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyVendureWebhook,
  parseWebhookEvents: parseVendureWebhookEvents,
}
