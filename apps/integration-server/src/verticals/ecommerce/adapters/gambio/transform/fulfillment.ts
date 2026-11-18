/**
 * WooCommerce (Gambio) Order → canonical Fulfillment (synthesised).
 *
 * WooCommerce v3 does not expose a standalone fulfillment resource.
 * Fulfillment metadata lives on the order: `date_completed`, `status`
 * (completed = FULFILLED), and optional `tracking_number` / `tracking_url`
 * metadata fields (set by popular shipping plugins).
 *
 * One synthetic fulfillment is derived per shipped or completed order.
 * Only orders whose `shipping_status` resolves to FULFILLED/PARTIAL are
 * considered; others return undefined and are filtered out.
 */
import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawWooCommerceOrder } from './order'

function mapStatus(orderStatus: string | undefined): FulfillmentStatus | undefined {
  switch ((orderStatus ?? '').toLowerCase()) {
    case 'completed':
      return 'SUCCESS'
    case 'processing':
    case 'on-hold':
      return 'OPEN'
    case 'cancelled':
    case 'canceled':
    case 'refunded':
    case 'failed':
      return 'CANCELLED'
    default:
      return undefined
  }
}

/** Extract a tracking number from WC order meta_data (shipping plugins). */
function pickMeta(
  meta: Array<{ key: string; value: unknown }> | undefined,
  key: string,
): string | undefined {
  const match = (meta ?? []).find((m) => m.key === key || m.key === `_${key}`)
  if (match?.value == null) return undefined
  const v = String(match.value)
  return v.length > 0 ? v : undefined
}

export function transformFulfillment(raw: RawWooCommerceOrder): Fulfillment | undefined {
  const status = mapStatus(raw.status)
  // Only surface fulfilled / in-progress orders as fulfillments.
  if (!status) return undefined

  const meta = raw.meta_data as Array<{ key: string; value: unknown }> | undefined
  const trackingNumber =
    pickMeta(meta, 'tracking_number') ??
    pickMeta(meta, 'tracking_id') ??
    pickMeta(meta, 'shipment_tracking_number') ??
    undefined
  const trackingUrl =
    pickMeta(meta, 'tracking_url') ??
    pickMeta(meta, 'tracking_link') ??
    undefined
  const carrier =
    pickMeta(meta, 'tracking_provider') ??
    pickMeta(meta, 'carrier') ??
    undefined

  const lineItems = (raw.line_items ?? []).map((li) => ({
    lineItemId: String(li.id),
    quantity: li.quantity,
  }))

  return {
    id: `${raw.id}:fulfillment`,
    orderId: String(raw.id),
    status,
    trackingNumber,
    trackingUrl: trackingUrl ?? undefined,
    carrier,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt: raw.date_completed_gmt ?? raw.date_completed ?? undefined,
    createdAt: raw.date_created_gmt ?? raw.date_created ?? undefined,
    updatedAt: raw.date_modified_gmt ?? raw.date_modified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
