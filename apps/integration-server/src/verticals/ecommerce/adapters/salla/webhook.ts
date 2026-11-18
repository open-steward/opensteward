/**
 * Salla webhook verification and event parsing.
 *
 * Verification: Salla signs the raw request body with HMAC-SHA256 (hex)
 * using the shared webhook secret and puts the signature in the
 * `X-Salla-Signature` header. Compare using `timingSafeEqual`.
 *
 * Event parsing: Salla sends the event type in the JSON payload as `event`
 * (e.g. `order.created`, `product.updated`). Map these dot-notation event
 * names to the canonical { resourceType, action } shape.
 *
 * Docs: https://docs.salla.dev/doc-421119
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifySallaWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-salla-signature'] ?? headers['X-Salla-Signature']
    if (!headerSig) return false

    // Salla uses HMAC-SHA256 hex digest
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event → canonical mapping ────────────────────────────────────────────────

// Salla event format: "<resource>.<action>" e.g. "order.created"
// The resource part may be compound e.g. "order.shipment.created" → fulfillments

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  order: 'orders',
  customer: 'customers',
  'order.shipment': 'fulfillments',
  'order.refund': 'refunds',
  category: 'collections',
  coupon: 'discounts',
  specialoffer: 'discounts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  create: 'created',
  updated: 'updated',
  update: 'updated',
  'status.updated': 'updated',
  deleted: 'deleted',
  delete: 'deleted',
}

function mapSallaEvent(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  // Try longest compound resource key first
  const lower = eventType.toLowerCase()

  // Check compound keys first (e.g. "order.shipment")
  for (const key of Object.keys(RESOURCE_MAP).sort((a, b) => b.length - a.length)) {
    if (lower.startsWith(key + '.')) {
      const actionPart = lower.slice(key.length + 1)
      const action = ACTION_MAP[actionPart] ?? 'updated'
      return { resourceType: RESOURCE_MAP[key]!, action }
    }
  }

  // Fallback: split on first dot
  const dotIdx = lower.indexOf('.')
  const resource = dotIdx >= 0 ? lower.slice(0, dotIdx) : lower
  const actionPart = dotIdx >= 0 ? lower.slice(dotIdx + 1) : 'updated'

  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[actionPart] ?? 'unknown',
  }
}

/**
 * Parse a Salla webhook delivery into a canonical event array (always length 1).
 *
 * Salla sends: { event: "order.created", merchant: <id>, data: { id, ... } }
 */
export function parseSallaWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType = (payload['event'] as string | undefined) ?? ''
  const { resourceType, action } = eventType
    ? mapSallaEvent(eventType)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  // Resource id is in payload.data.id
  const data = payload['data'] as Record<string, unknown> | undefined
  const rawId = data?.['id'] ?? payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'salla',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const sallaWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifySallaWebhook,
  parseWebhookEvents: parseSallaWebhookEvents,
}
