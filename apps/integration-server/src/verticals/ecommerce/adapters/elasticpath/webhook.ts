/**
 * Elastic Path webhook (Integrations) verification and event parsing.
 *
 * Elastic Path "Integrations" deliver events via HTTPS POST. The payload
 * includes a `secret_key` in the integration configuration, and the
 * delivery includes an `X-Moltin-Secret-Key` header for verification.
 *
 * Event types follow the pattern `<resource>.<action>`, e.g.
 * `order.paid`, `customer.created`, `product.updated`.
 *
 * Docs: https://documentation.elasticpath.com/commerce-cloud/docs/developer/integrations/
 */

import { timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Verify an Elastic Path webhook delivery by comparing the secret key
 * in the header against the configured secret.
 */
export function verifyElasticPathWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSecret =
      headers['x-moltin-secret-key'] ??
      headers['X-Moltin-Secret-Key'] ??
      headers['x-ep-secret'] ??
      headers['X-EP-Secret']
    if (!headerSecret) return false
    const a = Buffer.from(headerSecret)
    const b = Buffer.from(secret)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event type → canonical mapping ──────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  catalog: 'collections',
  order: 'orders',
  customer: 'customers',
  'inventory-item': 'inventory_levels',
  inventory: 'inventory_levels',
  transaction: 'transactions',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  fulfilled: 'updated',
  paid: 'updated',
  authorized: 'updated',
  captured: 'updated',
  refunded: 'updated',
  cancelled: 'updated',
}

function mapEventType(
  eventType: string,
): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Elastic Path event format: "<resource>.<action>", e.g. "order.paid"
  const dotIndex = eventType.indexOf('.')
  const resource = dotIndex > 0 ? eventType.slice(0, dotIndex) : eventType
  const verb = dotIndex > 0 ? eventType.slice(dotIndex + 1) : 'unknown'
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse an Elastic Path webhook delivery into canonical events.
 *
 * Elastic Path sends one event per HTTP request. The triggered event type is
 * at `payload.triggered_events[0]` or `payload.type`, and the resource data
 * is in `payload.resources` or `payload.payload`.
 */
export function parseElasticPathWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType =
    (payload['type'] as string | undefined) ??
    ((payload['triggered_events'] as string[] | undefined)?.[0]) ??
    ''
  const { resourceType, action } = eventType
    ? mapEventType(eventType)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  // Resource ID can be at payload.resources.id, payload.id, or payload.payload.id
  const resources = payload['resources'] as Record<string, unknown> | undefined
  const innerPayload = payload['payload'] as Record<string, unknown> | undefined
  const rawId = resources?.['id'] ?? payload['id'] ?? innerPayload?.['id']
  const resourceId = rawId == null ? '' : String(rawId)

  const storeId = payload['store_id'] as string | undefined

  return [
    {
      platform: 'elasticpath',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      tenantId: storeId,
      payload,
    },
  ]
}

export const elasticpathWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyElasticPathWebhook,
  parseWebhookEvents: parseElasticPathWebhookEvents,
}
