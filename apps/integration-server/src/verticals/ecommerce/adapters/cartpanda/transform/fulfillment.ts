/**
 * CartPanda Fulfillment → canonical Fulfillment.
 *
 * CartPanda supports creating fulfillments for orders. A fulfillment
 * records shipment tracking and the line items being shipped.
 *
 * Docs: https://dev.cartpanda.com/docs/cartx-api-doc/f28674d081028-create-fulfillment
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawCartpandaFulfillmentLineItem {
  id: number | string
  quantity: number
}

export interface RawCartpandaFulfillment {
  id: number | string
  order_id: number | string
  status?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  /** Carrier / shipping company name. */
  tracking_company?: string | null
  service?: string | null
  location_id?: number | string | null
  line_items?: RawCartpandaFulfillmentLineItem[]
  notify_customer?: boolean
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
  raw: RawCartpandaFulfillmentLineItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({ lineItemId: String(li.id), quantity: li.quantity }))
}

export function transformFulfillment(raw: RawCartpandaFulfillment): Fulfillment {
  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    carrier: raw.tracking_company ?? undefined,
    service: raw.service ?? undefined,
    locationId: raw.location_id != null ? String(raw.location_id) : undefined,
    lineItems: mapLineItems(raw.line_items),
    notifyCustomer: raw.notify_customer,
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
    tracking_number: fulfillment.trackingNumber,
    tracking_url: fulfillment.trackingUrl,
    tracking_company: fulfillment.carrier,
    notify_customer: fulfillment.notifyCustomer,
    line_items: fulfillment.lineItems?.map((li) => ({
      id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
