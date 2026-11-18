/**
 * WooCommerce Order → canonical Fulfillment.
 *
 * WooCommerce doesn't have a standalone "fulfillment" resource; instead,
 * an order's shipping status is tracked via the order `status` field and
 * shipping line items. We synthesise one Fulfillment per order, mapping the
 * shipping lines onto the canonical shape.
 *
 * Each order's fulfillment id is `ord:{orderId}` to avoid collisions.
 *
 * Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/#orders
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawWooCommerceShippingLine {
  id?: number | string
  method_title?: string | null
  method_id?: string | null
  instance_id?: string | null
  total?: string | null
  meta_data?: Array<{ key: string; value: unknown }>
  [key: string]: unknown
}

export interface RawWooCommerceFulfillmentOrder {
  id: number | string
  status?: string
  date_modified_gmt?: string
  date_modified?: string
  date_completed_gmt?: string | null
  date_completed?: string | null
  shipping_lines?: RawWooCommerceShippingLine[]
  line_items?: Array<{ id: number | string; quantity?: number; [k: string]: unknown }>
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  processing: 'OPEN',
  'on-hold': 'OPEN',
  completed: 'SUCCESS',
  cancelled: 'CANCELLED',
  refunded: 'CANCELLED',
  failed: 'ERROR',
}

function mapFulfillmentStatus(status: string | undefined): FulfillmentStatus | undefined {
  if (!status) return undefined
  return STATUS_MAP[status.toLowerCase()] ?? undefined
}

/**
 * Build a canonical Fulfillment from a WooCommerce order.
 * @param raw  The raw WooCommerce order object.
 */
export function transformFulfillment(raw: RawWooCommerceFulfillmentOrder): Fulfillment {
  const orderId = String(raw.id)
  const firstShipping = (raw.shipping_lines ?? [])[0]

  // Extract tracking info from meta_data if present (via many WC shipping plugins)
  const metaData: Array<{ key: string; value: unknown }> = firstShipping?.meta_data ?? []
  const trackingMeta = metaData.find(
    (m) => m.key.toLowerCase().includes('tracking') && m.key.toLowerCase().includes('number'),
  )
  const trackingNumber = trackingMeta?.value != null ? String(trackingMeta.value) : undefined

  const lineItems = (raw.line_items ?? [])
    .filter((li) => li.id != null)
    .map((li) => ({
      lineItemId: String(li.id),
      quantity: Math.max(1, li.quantity ?? 1),
    }))

  return {
    id: `ord:${orderId}`,
    orderId,
    status: mapFulfillmentStatus(raw.status),
    trackingNumber,
    carrier: firstShipping?.method_id ?? undefined,
    service: firstShipping?.method_title ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt:
      raw.status === 'completed'
        ? (toIsoDatetime(raw.date_completed_gmt ?? raw.date_completed) ?? undefined)
        : undefined,
    createdAt: toIsoDatetime(raw.date_modified_gmt ?? raw.date_modified) ?? undefined,
    updatedAt: toIsoDatetime(raw.date_modified_gmt ?? raw.date_modified) ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
