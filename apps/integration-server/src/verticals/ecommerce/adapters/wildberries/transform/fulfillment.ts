/**
 * WooCommerce (Wildberries) Order Shipping Line → canonical Fulfillment.
 *
 * WooCommerce does not have a standalone fulfillment resource. Fulfillments
 * are inferred from order shipping lines plus the order status. When the
 * order status is `completed`, the shipment is considered successful.
 *
 * Wildberries sellers may push tracking via the WooCommerce Shipment
 * Tracking plugin (stored in order meta_data under _wc_shipment_tracking_items).
 *
 * We synthesize one fulfillment per order from the shipping lines and
 * tracking meta-data if present.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawWooCommerceOrder } from './order'

// ── Helpers ──────────────────────────────────────────────────────────────────

interface TrackingItem {
  tracking_provider?: string
  tracking_number?: string
  date_shipped?: string | number
  [key: string]: unknown
}

function extractTracking(raw: RawWooCommerceOrder): TrackingItem | undefined {
  const meta = raw.meta_data as Array<{ key: string; value: unknown }> | undefined
  if (!Array.isArray(meta)) return undefined
  const entry = meta.find((m) => m.key === '_wc_shipment_tracking_items')
  if (!entry) return undefined
  const val = entry.value
  if (Array.isArray(val) && val.length > 0) return val[0] as TrackingItem
  return undefined
}

function inferStatus(raw: RawWooCommerceOrder): FulfillmentStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'completed') return 'SUCCESS'
  if (s === 'cancelled' || s === 'failed') return 'CANCELLED'
  if (s === 'processing' || s === 'on-hold') return 'OPEN'
  return 'PENDING'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawWooCommerceOrder): Fulfillment {
  const tracking = extractTracking(raw)

  // Build synthetic id from order id + first shipping line id (if present)
  const shippingLines = raw.shipping_lines as Array<{ id?: number | string; method_title?: string; total?: string }> | undefined
  const shippingLineId = shippingLines?.[0]?.id
  const id = shippingLineId != null ? `${raw.id}-${shippingLineId}` : `ful-${raw.id}`

  return {
    id: String(id),
    orderId: String(raw.id),
    status: inferStatus(raw),
    trackingNumber: tracking?.tracking_number ?? undefined,
    carrier: tracking?.tracking_provider ?? shippingLines?.[0]?.method_title ?? undefined,
    lineItems: (raw.line_items ?? []).map((li) => ({
      lineItemId: String(li.id),
      quantity: li.quantity,
    })),
    shippedAt:
      raw.date_paid_gmt ?? raw.date_paid ?? undefined,
    deliveredAt:
      raw.date_completed_gmt ?? raw.date_completed ?? undefined,
    createdAt: raw.date_created_gmt ?? raw.date_created,
    updatedAt: raw.date_modified_gmt ?? raw.date_modified,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
