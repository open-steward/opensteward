/**
 * Bumpa Fulfillment → canonical Fulfillment.
 *
 * Bumpa represents order fulfillment/shipping information nested inside or
 * alongside order records. A fulfillment object contains the order id,
 * carrier details, tracking number, and status.
 *
 * Bumpa does not expose a dedicated standalone fulfillment list endpoint;
 * fulfillment data is accessed through order records.
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawBumpaFulfillmentLineItem {
  id?: number | string
  order_item_id?: number | string
  quantity?: number
  [key: string]: unknown
}

export interface RawBumpaFulfillment {
  id: number | string
  order_id: number | string
  status?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  carrier?: string | null
  courier?: string | null
  service?: string | null
  location_id?: number | string | null
  line_items?: RawBumpaFulfillmentLineItem[]
  items?: RawBumpaFulfillmentLineItem[]
  notify_customer?: boolean
  shipped_at?: string | null
  estimated_delivery_at?: string | null
  delivered_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  open: 'OPEN',
  processing: 'OPEN',
  success: 'SUCCESS',
  shipped: 'SUCCESS',
  delivered: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  error: 'ERROR',
  failure: 'FAILURE',
  failed: 'FAILURE',
}

function mapLineItems(
  raw: RawBumpaFulfillmentLineItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: String(li.id ?? li.order_item_id ?? ''),
    quantity: li.quantity ?? 1,
  }))
}

export function transformFulfillment(raw: RawBumpaFulfillment): Fulfillment {
  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    carrier: raw.carrier ?? raw.courier ?? undefined,
    service: raw.service ?? undefined,
    locationId: raw.location_id != null ? String(raw.location_id) : undefined,
    lineItems: mapLineItems(raw.line_items ?? raw.items),
    notifyCustomer: raw.notify_customer,
    shippedAt: raw.shipped_at ?? undefined,
    estimatedDeliveryAt: raw.estimated_delivery_at ?? undefined,
    deliveredAt: raw.delivered_at ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    tracking_number: fulfillment.trackingNumber,
    tracking_url: fulfillment.trackingUrl,
    carrier: fulfillment.carrier,
    service: fulfillment.service,
    location_id: fulfillment.locationId,
    notify_customer: fulfillment.notifyCustomer,
    items: fulfillment.lineItems?.map((li) => ({
      order_item_id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
