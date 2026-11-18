/**
 * Drupal Commerce Shipment → canonical Fulfillment.
 *
 * `commerce_shipment--default` JSON:API attributes:
 *   - `title`               — shipment display label
 *   - `state`               — draft | ready | shipped | canceled
 *   - `tracking_code`       — tracking number (may be null)
 *   - `amount.number`       — shipping cost decimal string
 *   - `amount.currency_code`
 *   - `changed`             — Unix timestamp of last change
 *   - `shipped_time`        — Unix timestamp when shipped (may be null)
 *
 * Relationships:
 *   - `order_id`            — back-link to commerce_order
 *   - `shipping_profile`    — commerce_profile for ship-to address
 *   - `shipping_method`     — commerce_shipping_method
 *
 * State mapping:
 *   draft    → PENDING
 *   ready    → OPEN
 *   shipped  → SUCCESS
 *   canceled → CANCELLED
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { JsonApiResource } from '../client'

// ── Raw Drupal shapes ─────────────────────────────────────────────────────────

export interface DrupalShipmentAttributes {
  title?: string
  state?: string
  tracking_code?: string | null
  amount?: { number?: string; currency_code?: string } | null
  changed?: number | string | null
  shipped_time?: number | string | null
  [key: string]: unknown
}

export type DrupalShipment = JsonApiResource & {
  attributes: DrupalShipmentAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unixToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!Number.isFinite(n) || n <= 0) return undefined
  return new Date(n * 1000).toISOString()
}

function mapStatus(state: string | undefined): FulfillmentStatus | undefined {
  if (!state) return undefined
  switch (state) {
    case 'draft':
      return 'PENDING'
    case 'ready':
      return 'OPEN'
    case 'shipped':
      return 'SUCCESS'
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

function relationshipId(resource: JsonApiResource, field: string): string | undefined {
  const rel = resource.relationships?.[field]
  if (!rel || !rel.data || Array.isArray(rel.data)) return undefined
  return rel.data.id
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: DrupalShipment): Fulfillment {
  const attrs = raw.attributes
  const orderId = relationshipId(raw, 'order_id') ?? ''
  const locationId = relationshipId(raw, 'store_id')
  const shippingMethodId = relationshipId(raw, 'shipping_method')

  return {
    id: raw.id,
    orderId,
    status: mapStatus(attrs.state),
    trackingNumber: attrs.tracking_code ?? undefined,
    carrier: shippingMethodId ?? undefined,
    locationId,
    shippedAt: unixToIso(attrs.shipped_time),
    updatedAt: unixToIso(attrs.changed),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    data: {
      type: 'commerce_shipment--default',
      attributes: {
        ...(fulfillment.trackingNumber != null ? { tracking_code: fulfillment.trackingNumber } : {}),
      },
    },
  }
}
