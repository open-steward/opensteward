/**
 * Medusa v2 Fulfillment → canonical Fulfillment.
 *
 * Medusa v2 has native fulfillment objects nested under orders, with
 * tracking support and line items.
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawMedusaFulfillmentItem {
  item_id?: string
  quantity: number
  [key: string]: unknown
}

export interface RawMedusaFulfillment {
  id: string
  order_id?: string
  status?: string
  tracking_numbers?: string[]
  tracking_links?: Array<{ url?: string; tracking_number?: string }> | null
  provider_id?: string | null
  location_id?: string | null
  items?: RawMedusaFulfillmentItem[]
  shipped_at?: string | null
  created_at?: string
  updated_at?: string
  canceled_at?: string | null
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  created: 'OPEN',
  shipped: 'SUCCESS',
  delivered: 'SUCCESS',
  canceled: 'CANCELLED',
  requires_action: 'PENDING',
}

function mapLineItems(
  raw: RawMedusaFulfillmentItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.item_id ?? '',
    quantity: li.quantity,
  }))
}

export function transformFulfillment(
  raw: RawMedusaFulfillment,
  orderId: string = '',
): Fulfillment {
  const trackingNumber =
    raw.tracking_numbers?.[0] ??
    raw.tracking_links?.[0]?.tracking_number ??
    undefined
  const trackingUrl = raw.tracking_links?.[0]?.url ?? undefined

  return {
    id: raw.id,
    orderId: raw.order_id ?? orderId,
    status: raw.status ? STATUS_MAP[raw.status] ?? undefined : undefined,
    trackingNumber,
    trackingUrl,
    carrier: raw.provider_id ?? undefined,
    locationId: raw.location_id ?? undefined,
    lineItems: mapLineItems(raw.items),
    shippedAt: raw.shipped_at ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    location_id: fulfillment.locationId,
    tracking_numbers: fulfillment.trackingNumber
      ? [fulfillment.trackingNumber]
      : undefined,
    items: fulfillment.lineItems?.map((li) => ({
      item_id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
