/**
 * WooCommerce Order Shipping Line → canonical Fulfillment.
 *
 * WooCommerce does not expose a standalone fulfillment resource — shipment
 * information is embedded within orders via `shipping_lines` and optional
 * tracking metadata (added by plugins). We derive one canonical Fulfillment
 * per order from the first shipping line and the order's status.
 *
 * WC order statuses that indicate shipped/fulfilled:
 *   completed  → SUCCESS
 *   processing → OPEN
 *   on-hold    → PENDING
 *   cancelled  → CANCELLED
 *   refunded   → CANCELLED
 *   failed     → FAILURE
 *
 * Third-party tracking plugins (e.g. Shipment Tracking) may attach
 * tracking number / carrier info via `meta_data` on shipping lines.
 * We surface those when present.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWooCommerceShippingLineMeta {
  key?: string
  value?: string | null
  [key: string]: unknown
}

export interface RawWooCommerceShippingLine {
  id?: number | string
  method_title?: string | null
  method_id?: string | null
  meta_data?: RawWooCommerceShippingLineMeta[]
  [key: string]: unknown
}

export interface RawWooCommerceOrderForFulfillment {
  id: number | string
  status?: string
  date_modified_gmt?: string | null
  date_modified?: string | null
  date_completed_gmt?: string | null
  date_completed?: string | null
  shipping_lines?: RawWooCommerceShippingLine[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(wooStatus: string | undefined): FulfillmentStatus | undefined {
  switch ((wooStatus ?? '').toLowerCase()) {
    case 'completed':
      return 'SUCCESS'
    case 'processing':
      return 'OPEN'
    case 'on-hold':
    case 'pending':
      return 'PENDING'
    case 'cancelled':
    case 'refunded':
      return 'CANCELLED'
    case 'failed':
      return 'FAILURE'
    default:
      return undefined
  }
}

function getMetaValue(
  meta: RawWooCommerceShippingLineMeta[] | undefined,
  key: string,
): string | undefined {
  const entry = (meta ?? []).find((m) => m.key === key)
  return entry?.value ?? undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawWooCommerceOrderForFulfillment): Fulfillment {
  const orderId = String(raw.id)
  const firstShipping = raw.shipping_lines?.[0]
  const meta = firstShipping?.meta_data

  // Shipment Tracking plugin keys: _tracking_number, _tracking_carrier, _tracking_url
  const trackingNumber = getMetaValue(meta, '_tracking_number') ??
    getMetaValue(meta, 'tracking_number')
  const carrier = getMetaValue(meta, '_tracking_carrier') ??
    getMetaValue(meta, 'tracking_carrier')
  const trackingUrl = getMetaValue(meta, '_tracking_link') ??
    getMetaValue(meta, 'tracking_url')

  const deliveredAt = raw.date_completed_gmt ?? raw.date_completed ?? undefined
  const updatedAt = raw.date_modified_gmt ?? raw.date_modified ?? undefined

  return {
    id: firstShipping?.id != null
      ? `${orderId}:${firstShipping.id}`
      : `${orderId}:default`,
    orderId,
    status: mapStatus(raw.status),
    trackingNumber: trackingNumber ?? undefined,
    trackingUrl: trackingUrl ?? undefined,
    carrier: carrier ?? undefined,
    service: firstShipping?.method_title ?? undefined,
    deliveredAt: raw.status === 'completed' ? deliveredAt : undefined,
    updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → WooCommerce order status update body. */
export function untransformFulfillment(data: Partial<Fulfillment>): Record<string, unknown> {
  return {
    status: 'completed',
    shipping_lines: data.trackingNumber
      ? [
          {
            meta_data: [
              { key: '_tracking_number', value: data.trackingNumber },
              { key: '_tracking_carrier', value: data.carrier ?? '' },
              { key: '_tracking_link', value: data.trackingUrl ?? '' },
            ],
          },
        ]
      : undefined,
  }
}
