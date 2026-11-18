/**
 * Aimeos Order → canonical Fulfillment.
 *
 * Aimeos does not have a first-class "fulfillment" resource in its REST API.
 * Fulfillment state is tracked on the order itself via `order.statusdelivery`.
 * Shipping/tracking information is stored in the order base and its service
 * records (`order/base/service` with type "delivery").
 *
 * This adapter synthesises a Fulfillment from an `order` resource combined
 * with an optional `order/base/service` delivery record.
 *
 * `order` resource attributes:
 *   order.id              — id
 *   order.statusdelivery  — delivery status int (see AIMEOS_ORDER_STATUS)
 *   order.ctime / mtime   — timestamps
 *
 * `order/base/service` (delivery) attributes:
 *   order.base.service.type          — "delivery" | "payment"
 *   order.base.service.code          — carrier/service code
 *   order.base.service.name          — carrier display name
 *   order.base.service.attribute     — JSON blob with tracking info
 *   order.base.service.ctime / mtime
 *
 * Delivery status → canonical FulfillmentStatus:
 *   -1 = deleted    → CANCELLED
 *    0 = unfinished → PENDING
 *    1 = waiting    → PENDING
 *    2 = progress   → OPEN
 *    3 = dispatch   → OPEN
 *    4 = delivered  → SUCCESS
 *    5 = lost       → FAILURE
 *    6 = refused    → CANCELLED
 *    7 = returned   → RESTOCKED (mapped to CANCELLED here)
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { AimeosResource } from '../client'
import type { AimeosOrder, AimeosOrderAttributes } from './order'

// ── Raw Aimeos shapes ─────────────────────────────────────────────────────────

export interface AimeosServiceAttributes {
  'order.base.service.type'?: string
  'order.base.service.code'?: string
  'order.base.service.name'?: string
  'order.base.service.mediaurl'?: string | null
  'order.base.service.attribute'?: unknown
  'order.base.service.ctime'?: string | null
  'order.base.service.mtime'?: string | null
  [key: string]: unknown
}

export type AimeosService = AimeosResource & {
  attributes: AimeosServiceAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapDeliveryStatus(statusCode: number | undefined): FulfillmentStatus | undefined {
  if (statusCode == null) return undefined
  switch (statusCode) {
    case 4:
      return 'SUCCESS'
    case 3:
    case 2:
      return 'OPEN'
    case 1:
    case 0:
      return 'PENDING'
    case 5:
      return 'FAILURE'
    case -1:
    case 6:
    case 7:
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

function extractTrackingNumber(serviceAttrs: AimeosServiceAttributes): string | undefined {
  const attribute = serviceAttrs['order.base.service.attribute']
  if (!attribute || typeof attribute !== 'object') return undefined
  // Aimeos stores service attributes as an array of {code, value} pairs
  const attrs = attribute as Array<{ code?: string; value?: string }>
  if (!Array.isArray(attrs)) return undefined
  const trackingAttr = attrs.find(
    (a) =>
      a.code === 'tracking-code' ||
      a.code === 'tracking' ||
      a.code === 'parcel-tracking',
  )
  return trackingAttr?.value ?? undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Build a Fulfillment from an Aimeos order resource plus an optional delivery
 * service record.
 */
export function transformFulfillment(
  raw: AimeosOrder,
  deliveryService?: AimeosService,
): Fulfillment {
  const attrs = raw.attributes as AimeosOrderAttributes
  const statusCode = attrs['order.statusdelivery'] as number | undefined
  const serviceAttrs = deliveryService?.attributes

  const trackingNumber = serviceAttrs ? extractTrackingNumber(serviceAttrs) : undefined
  const carrier = serviceAttrs?.['order.base.service.name'] as string | undefined
  const service = serviceAttrs?.['order.base.service.code'] as string | undefined

  return {
    id: raw.id,
    orderId: raw.id,
    status: mapDeliveryStatus(statusCode),
    trackingNumber,
    carrier,
    service,
    createdAt: attrs['order.ctime'] ?? undefined,
    updatedAt: attrs['order.mtime'] ?? undefined,
    shippedAt: statusCode != null && statusCode >= 3 ? (attrs['order.mtime'] ?? undefined) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
