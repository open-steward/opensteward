import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import { Iso4217Currency } from '@opensteward/shared'
import { toISODate, nonempty } from '../../shared/transform'
import { transformAddress, type CubboAddress } from './address'

/**
 * One entry of `order_lines` in the documented GET /v1/orders example:
 *   { "id": 332, "name": null, "sku": null, "quantity": 1, "generated": false,
 *     "price_per_item": null, "product": { ... }, "stock_units": [ ... ] }
 *
 * `price_per_item` is not mapped: the docs give neither its type nor its unit,
 * and the canonical line amount is an integer in minor units.
 */
export interface CubboOrderLine {
  id: number | string
  name?: string | null
  sku?: string | null
  quantity?: number | null
  [key: string]: unknown
}

/**
 * An order as documented in the GET /v1/orders 200 example
 * (developers.cubbo.com, "Get Orders"). Only fields read below are typed;
 * the whole record rides on `metadata`.
 */
export interface CubboOrder {
  id: number | string
  store_id?: number | null
  order_number?: string | null
  status?: string | null
  shipping_status?: string | null
  order_date?: string | null
  shipping_date?: string | null
  delivered_at?: string | null
  updated_at?: string | null
  currency?: string | null
  shipping?: CubboAddress | null
  order_lines?: CubboOrderLine[] | null
  [key: string]: unknown
}

/**
 * Cubbo's documented order statuses ("Order Statuses (status)"):
 * initial, unpaid, empty, error, entirely_dropshipping, backorder, pending,
 * processing, picking, packing, shipped, canceled, hold, interrupted,
 * returning, returned, return_arrived, reentered.
 *
 * unpaid, empty, error, entirely_dropshipping and backorder have no canonical
 * counterpart and map to 'unknown'.
 */
function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'initial': // "Has not been processed by the system."
    case 'pending': // "ready for processing."
      return 'PENDING'
    case 'processing': // "awating picker availability."
    case 'picking':
    case 'packing':
      return 'PROCESSING'
    case 'hold': // "order was paused."
      return 'ON_HOLD'
    case 'shipped': // "order packing has concluded."
      return 'SHIPPED'
    case 'canceled':
    case 'interrupted': // "order was cancelled during processing, picking or packing."
      return 'CANCELLED'
    case 'returning':
    case 'returned':
    case 'return_arrived':
    case 'reentered':
      return 'RETURNED'
    default:
      return 'unknown'
  }
}

function transformLine(raw: CubboOrderLine): Lineitem {
  return {
    id: String(raw.id),
    sku: raw.sku ?? undefined,
    name: raw.name ?? undefined,
    quantity: raw.quantity ?? undefined,
  }
}

export function transformOrder(raw: CubboOrder): Order {
  const status = mapOrderStatus(raw.status)
  const currency = raw.currency ?? undefined
  return {
    id: String(raw.id),
    // A shipped order whose documented shipping_status is "shipment_delivered"
    // ("carrier has delivered the package") has been delivered.
    status:
      status === 'SHIPPED' && raw.shipping_status === 'shipment_delivered' ? 'DELIVERED' : status,
    orderNumber: raw.order_number ?? undefined,
    destinationAddress: raw.shipping ? transformAddress(raw.shipping) : undefined,
    lineItems: nonempty(raw.order_lines?.map(transformLine)),
    currency: currency && Iso4217Currency.safeParse(currency).success ? currency : undefined,
    orderAt: toISODate(raw.order_date),
    shippedAt: toISODate(raw.shipping_date),
    deliveredAt: toISODate(raw.delivered_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
