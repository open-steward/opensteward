/**
 * Tiendanube / Nuvemshop Fulfillment → canonical Fulfillment.
 *
 * Tiendanube's fulfillment data is embedded in the order's `fulfillments`
 * array (returned when `?aggregates=fulfillment_orders` is requested) or
 * exposed via the webhook event `fulfillment/updated`.
 *
 * The fulfillment object on Tiendanube has:
 *  - `id`: fulfillment identifier
 *  - `order_id`: parent order identifier
 *  - `status`: e.g. "pending", "shipped", "delivered"
 *  - `tracking_number`, `tracking_url`
 *  - `shipping_carrier_name`: carrier / company
 *  - `line_items`: array of `{ id, quantity }`
 *  - `created_at`, `updated_at`
 *
 * Docs: https://tiendanube.github.io/api-documentation/resources/fulfillment
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTiendanubeFulfillmentLineItem {
  id: number | string
  quantity: number
  [key: string]: unknown
}

export interface RawTiendanubeFulfillment {
  id: number | string
  order_id?: number | string
  status?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  shipping_carrier_name?: string | null
  service?: string | null
  location_id?: number | string | null
  line_items?: RawTiendanubeFulfillmentLineItem[]
  notify_customer?: boolean
  shipped_at?: string | null
  estimated_delivery_at?: string | null
  delivered_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Status map ────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  open: 'OPEN',
  packed: 'PENDING',
  shipped: 'SUCCESS',
  delivered: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  returned: 'CANCELLED',
  failed: 'FAILURE',
  error: 'ERROR',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapLineItems(
  raw: RawTiendanubeFulfillmentLineItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({ lineItemId: String(li.id), quantity: li.quantity }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawTiendanubeFulfillment): Fulfillment {
  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : '',
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_url ?? undefined,
    carrier: raw.shipping_carrier_name ?? undefined,
    service: raw.service ?? undefined,
    locationId: raw.location_id != null ? String(raw.location_id) : undefined,
    lineItems: mapLineItems(raw.line_items),
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
    location_id: fulfillment.locationId,
    tracking_number: fulfillment.trackingNumber,
    tracking_url: fulfillment.trackingUrl,
    shipping_carrier_name: fulfillment.carrier,
    notify_customer: fulfillment.notifyCustomer,
    line_items: fulfillment.lineItems?.map((li) => ({
      id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
