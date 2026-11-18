import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, nonempty, parseDecimal } from '../../shared/transform'

export interface ShipheroLineItem {
  sku: string
  quantity: number
  product_name?: string | null
  price?: number | string | null
  [key: string]: unknown
}

export interface ShipheroOrder {
  id: string
  legacy_id?: number
  order_number?: string | null
  fulfillment_status?: string | null
  customer_id?: string | null
  warehouse_id?: string | null
  shipping_address?: Record<string, unknown> | null
  warehouse_address?: Record<string, unknown> | null
  line_items?: ShipheroLineItem[]
  shipment_ids?: string[]
  notes?: string | null
  required_ship_method?: string | null
  order_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'pending':            return 'PENDING'
    case 'processing':         return 'PROCESSING'
    case 'on_hold':            return 'ON_HOLD'
    case 'awaiting_shipment':  return 'AWAITING_SHIPMENT'
    case 'fulfilled':
    case 'shipped':            return 'SHIPPED'
    case 'delivered':          return 'DELIVERED'
    case 'cancelled':          return 'CANCELLED'
    case 'returned':           return 'RETURNED'
    default:                   return 'PENDING'
  }
}

/**
 * ShipHero reports a line item's `price` as a decimal in major units ("19.99");
 * canonical `Amount` is an integer in minor units. Passing the decimal through
 * fails `OrderSchema.parse` (`expected int`), which is how this was found.
 */
function toMinorUnits(price: number | string | null | undefined): number | undefined {
  const value = parseDecimal(price)
  return value !== undefined ? Math.round(value * 100) : undefined
}

export function transformOrder(raw: ShipheroOrder): Order {
  const shipmentIds = nonempty(raw.shipment_ids ?? [])

  const lineItems = nonempty(
    (raw.line_items ?? []).map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      description: item.product_name ?? undefined,
      unitAmount: toMinorUnits(item.price),
    })),
  )

  return {
    id: raw.id,
    status: mapOrderStatus(raw.fulfillment_status),
    orderNumber: raw.order_number ?? undefined,
    customerId: raw.customer_id ?? undefined,
    warehouseId: raw.warehouse_id ?? undefined,
    originAddress: toAddress(raw.warehouse_address),
    destinationAddress: toAddress(raw.shipping_address),
    shipmentIds,
    lineItems,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.required_ship_method ?? undefined,
    orderAt: toISODate(raw.order_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
