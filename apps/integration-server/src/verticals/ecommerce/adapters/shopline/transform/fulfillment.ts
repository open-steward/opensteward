/**
 * SHOPLINE Fulfillment → canonical Fulfillment.
 *
 * SHOPLINE uses `tracking_info_list` (array, up to 10 entries) as the modern
 * tracking field. The deprecated flat fields `tracking_company`,
 * `tracking_number`, and `tracking_url` are also supported for
 * backward-compatibility with older API versions.
 *
 * Docs:
 *   https://developer.shopline.com/docs/admin-rest-api/order/shipping-and-fulfillment/create-a-fulfillment-based-on-an-order/
 *   https://developer.shopline.com/docs/admin-rest-api/order/shipping-and-fulfillment/get-all-fulfillment-orders/
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawShoplineTrackingInfo {
  tracking_company?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
}

export interface RawShoplineFulfillmentLineItem {
  id: number | string
  quantity: number
  [key: string]: unknown
}

export interface RawShoplineFulfillment {
  id: number | string
  order_id: number | string
  name?: string | null
  status?: string | null
  /** Modern tracking array (up to 10 entries). */
  tracking_info_list?: RawShoplineTrackingInfo[]
  /** Deprecated scalar tracking fields. */
  tracking_number?: string | null
  tracking_url?: string | null
  tracking_company?: string | null
  service?: string | null
  location_id?: number | string | null
  line_items?: RawShoplineFulfillmentLineItem[]
  notify_customer?: boolean
  shipment_status?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  open: 'OPEN',
  success: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  error: 'ERROR',
  failure: 'FAILURE',
}

function mapLineItems(
  raw: RawShoplineFulfillmentLineItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({ lineItemId: String(li.id), quantity: li.quantity }))
}

/** Extract the primary tracking info (first entry from list, or deprecated scalars). */
function resolveTracking(raw: RawShoplineFulfillment): {
  number?: string
  url?: string
  carrier?: string
} {
  const first = raw.tracking_info_list?.[0]
  if (first) {
    return {
      number: first.tracking_number ?? undefined,
      url: first.tracking_url ?? undefined,
      carrier: first.tracking_company ?? undefined,
    }
  }
  return {
    number: raw.tracking_number ?? undefined,
    url: raw.tracking_url ?? undefined,
    carrier: raw.tracking_company ?? undefined,
  }
}

export function transformFulfillment(raw: RawShoplineFulfillment): Fulfillment {
  const tracking = resolveTracking(raw)
  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: tracking.number,
    trackingUrl: tracking.url,
    carrier: tracking.carrier,
    service: raw.service ?? undefined,
    locationId: raw.location_id != null ? String(raw.location_id) : undefined,
    lineItems: mapLineItems(raw.line_items),
    notifyCustomer: raw.notify_customer,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  const trackingEntry: RawShoplineTrackingInfo = {
    tracking_company: fulfillment.carrier,
    tracking_number: fulfillment.trackingNumber,
    tracking_url: fulfillment.trackingUrl,
  }
  return {
    location_id: fulfillment.locationId,
    notify_customer: fulfillment.notifyCustomer,
    tracking_info_list: [trackingEntry],
    line_items: fulfillment.lineItems?.map((li) => ({
      id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
