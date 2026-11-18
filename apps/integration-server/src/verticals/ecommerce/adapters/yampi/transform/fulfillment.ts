/**
 * WooCommerce Shipment Lines → canonical Fulfillment.
 *
 * WooCommerce does not have a first-class Fulfillment resource.  The
 * closest equivalent is the `shipping_lines` array on each order, which
 * describes which shipping methods were applied.  We synthesise a single
 * Fulfillment per shipping line so downstream consumers can reason about
 * shipped items.
 *
 * The canonical `id` is `{orderId}:{shippingLineId}`.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawWooCommerceShippingLine {
  id?: number | string | null
  method_id?: string | null
  method_title?: string | null
  instance_id?: string | null
  total?: string | number | null
  tracking_number?: string | null
  tracking_url?: string | null
  date_created?: string | null
  date_modified?: string | null
  [key: string]: unknown
}

export interface RawWooCommerceOrderForFulfillment {
  id: number | string
  status?: string | null
  shipping_lines?: RawWooCommerceShippingLine[]
  date_modified_gmt?: string | null
  date_modified?: string | null
  date_created_gmt?: string | null
  date_created?: string | null
  date_completed?: string | null
  date_completed_gmt?: string | null
  [key: string]: unknown
}

function mapStatus(orderStatus: string | null | undefined): FulfillmentStatus | undefined {
  switch (orderStatus) {
    case 'completed':
      return 'SUCCESS'
    case 'cancelled':
      return 'CANCELLED'
    case 'failed':
      return 'FAILURE'
    case 'processing':
    case 'on-hold':
      return 'OPEN'
    case 'pending':
      return 'PENDING'
    default:
      return undefined
  }
}

export function transformFulfillments(raw: RawWooCommerceOrderForFulfillment): Fulfillment[] {
  const orderId = String(raw.id)
  const status = mapStatus(raw.status)
  const shippingLines = raw.shipping_lines ?? []

  if (shippingLines.length === 0) {
    // Synthesise a single unfulfilled marker when there are no shipping lines.
    return [
      {
        id: `${orderId}:default`,
        orderId,
        status: status ?? 'PENDING',
        createdAt: raw.date_created_gmt ?? raw.date_created ?? undefined,
        updatedAt: raw.date_modified_gmt ?? raw.date_modified ?? undefined,
        metadata: { woocommerce_order_status: raw.status ?? '' },
      },
    ]
  }

  return shippingLines.map((line, idx): Fulfillment => {
    const lineId = line.id != null ? String(line.id) : String(idx)
    return {
      id: `${orderId}:${lineId}`,
      orderId,
      status,
      carrier: line.method_title ?? undefined,
      service: line.method_id ?? undefined,
      trackingNumber: line.tracking_number ?? undefined,
      trackingUrl: line.tracking_url ?? undefined,
      deliveredAt: raw.date_completed_gmt ?? raw.date_completed ?? undefined,
      createdAt: line.date_created ?? raw.date_created_gmt ?? raw.date_created ?? undefined,
      updatedAt: line.date_modified ?? raw.date_modified_gmt ?? raw.date_modified ?? undefined,
      metadata: line as unknown as Record<string, unknown>,
    }
  })
}
