/**
 * Sapo Fulfillment → canonical Fulfillment.
 *
 * Sapo fulfillment endpoints are scoped to orders:
 *   GET /admin/orders/{order_id}/fulfillments.json
 *
 * Sapo uses `created_on` / `modified_on` for timestamps. Tracking fields
 * follow the same naming as Shopify (`tracking_number`, `tracking_url`,
 * `tracking_company`). Sapo also exposes `tracking_numbers` (plural array)
 * and `tracking_urls` (plural array) — we use the singular forms first.
 *
 * Docs: https://support.sapo.vn/fulfillment
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawSapoFulfillmentLineItem {
  id: number | string
  quantity: number
  [key: string]: unknown
}

export interface RawSapoFulfillment {
  id: number | string
  order_id: number | string
  status?: string | null
  tracking_number?: string | null
  tracking_numbers?: string[]
  tracking_url?: string | null
  tracking_urls?: string[]
  tracking_company?: string | null
  service?: string | null
  location_id?: number | string | null
  line_items?: RawSapoFulfillmentLineItem[]
  notify_customer?: boolean
  /** Sapo: `created_on` */
  created_on?: string
  /** Sapo: `modified_on` */
  modified_on?: string
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
  raw: RawSapoFulfillmentLineItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({ lineItemId: String(li.id), quantity: li.quantity }))
}

export function transformFulfillment(raw: RawSapoFulfillment): Fulfillment {
  // Prefer singular tracking fields; fall back to first element of plural arrays.
  const trackingNumber =
    raw.tracking_number ?? raw.tracking_numbers?.[0] ?? undefined
  const trackingUrl =
    raw.tracking_url ?? raw.tracking_urls?.[0] ?? undefined

  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: trackingNumber ?? undefined,
    trackingUrl: trackingUrl ?? undefined,
    carrier: raw.tracking_company ?? undefined,
    service: raw.service ?? undefined,
    locationId: raw.location_id != null ? String(raw.location_id) : undefined,
    lineItems: mapLineItems(raw.line_items),
    notifyCustomer: raw.notify_customer,
    createdAt: raw.created_on,
    updatedAt: raw.modified_on,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
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
