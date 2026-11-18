/**
 * BetterCommerce Shipment/Fulfillment → canonical Fulfillment.
 *
 * BetterCommerce tracks shipments through the OMS. The Commerce API exposes
 * shipping information on order records and fulfillment sub-resources.
 *
 * Field mapping:
 *  shipmentId / recordId   → id
 *  orderId                 → orderId
 *  status / shipmentStatus → status
 *  trackingNo              → trackingNumber
 *  trackingUrl             → trackingUrl
 *  carrier / courierName   → carrier
 *  items / lineItems       → lineItems
 *  createdAt               → createdAt
 *  updatedAt               → updatedAt
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawBCShipmentLineItem {
  lineItemId?: string
  recordId?: string
  qty?: number
  quantity?: number
  [key: string]: unknown
}

export interface RawBCShipment {
  shipmentId?: string
  recordId?: string
  orderId?: string
  status?: string | null
  shipmentStatus?: string | null
  trackingNo?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  carrier?: string | null
  courierName?: string | null
  locationId?: string | null
  items?: RawBCShipmentLineItem[]
  lineItems?: RawBCShipmentLineItem[]
  notifyCustomer?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  processing: 'PENDING',
  open: 'OPEN',
  dispatched: 'SUCCESS',
  shipped: 'SUCCESS',
  delivered: 'SUCCESS',
  success: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  error: 'ERROR',
  failed: 'FAILURE',
  failure: 'FAILURE',
}

function mapLineItems(
  raw: RawBCShipmentLineItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.lineItemId ?? li.recordId ?? '',
    quantity: li.qty ?? li.quantity ?? 1,
  }))
}

export function transformFulfillment(raw: RawBCShipment): Fulfillment {
  const rawStatus = (raw.status ?? raw.shipmentStatus ?? '').toLowerCase()
  return {
    id: raw.shipmentId ?? raw.recordId ?? '',
    orderId: raw.orderId ?? '',
    status: STATUS_MAP[rawStatus] ?? undefined,
    trackingNumber: raw.trackingNo ?? raw.trackingNumber ?? undefined,
    trackingUrl: raw.trackingUrl ?? undefined,
    carrier: raw.carrier ?? raw.courierName ?? undefined,
    locationId: raw.locationId ?? undefined,
    lineItems: mapLineItems(raw.items ?? raw.lineItems),
    notifyCustomer: raw.notifyCustomer,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → BetterCommerce shipment body. */
export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    orderId: fulfillment.orderId,
    trackingNo: fulfillment.trackingNumber,
    trackingUrl: fulfillment.trackingUrl,
    carrier: fulfillment.carrier,
    locationId: fulfillment.locationId,
    notifyCustomer: fulfillment.notifyCustomer,
    items: fulfillment.lineItems?.map((li) => ({
      lineItemId: li.lineItemId,
      qty: li.quantity,
    })),
  }
}
