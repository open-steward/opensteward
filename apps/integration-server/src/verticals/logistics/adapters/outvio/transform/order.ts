import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, parseDecimal, nonempty } from '../../shared/transform'
import { transformAddress, type OutvioAddress } from './address'

/**
 * A line item within an Outvio order.
 */
export interface OutvioLineItem {
  id?: string | null
  sku?: string | null
  name?: string | null
  description?: string | null
  quantity?: number | null
  price?: number | null
  unit_price?: number | null
  total?: number | null
  weight?: number | null
  weight_unit?: string | null
  [key: string]: unknown
}

/**
 * Raw Outvio order object as returned by GET /v1/orders/:id and
 * GET /v1/orders (list).
 */
export interface OutvioOrder {
  id: string
  orderNumber?: string | null
  order_number?: string | null
  status?: string | null
  customerId?: string | null
  customer_id?: string | null
  warehouseId?: string | null
  warehouse_id?: string | null
  originAddress?: OutvioAddress | null
  origin_address?: OutvioAddress | null
  destinationAddress?: OutvioAddress | null
  destination_address?: OutvioAddress | null
  shippingAddress?: OutvioAddress | null
  shipping_address?: OutvioAddress | null
  lineItems?: OutvioLineItem[] | null
  line_items?: OutvioLineItem[] | null
  shipmentIds?: string[] | null
  shipment_ids?: string[] | null
  currency?: string | null
  subtotal?: number | null
  tax?: number | null
  shippingCost?: number | null
  shipping_cost?: number | null
  discount?: number | null
  total?: number | null
  notes?: string | null
  requestedServiceCode?: string | null
  requested_service_code?: string | null
  orderedAt?: string | null
  ordered_at?: string | null
  shippedAt?: string | null
  shipped_at?: string | null
  deliveredAt?: string | null
  delivered_at?: string | null
  cancelledAt?: string | null
  cancelled_at?: string | null
  createdAt?: string | null
  created_at?: string | null
  updatedAt?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus | undefined {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'processing':
      return 'PROCESSING'
    case 'on_hold':
    case 'hold':
      return 'ON_HOLD'
    case 'awaiting_shipment':
    case 'ready_to_ship':
      return 'AWAITING_SHIPMENT'
    case 'shipped':
    case 'in_transit':
      return 'SHIPPED'
    case 'delivered':
      return 'DELIVERED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    case 'returned':
      return 'RETURNED'
    default:
      return undefined
  }
}

export function transformOrder(raw: OutvioOrder): Order {
  const orderNumber = raw.orderNumber ?? raw.order_number ?? undefined
  const destAddr =
    raw.destinationAddress ?? raw.destination_address ?? raw.shippingAddress ?? raw.shipping_address
  const originAddr = raw.originAddress ?? raw.origin_address
  const lineItems = raw.lineItems ?? raw.line_items ?? []
  const shipmentIds = nonempty([
    ...(raw.shipmentIds ?? []),
    ...(raw.shipment_ids ?? []),
  ])

  return {
    id: raw.id,
    status: mapOrderStatus(raw.status),
    orderNumber,
    customerId: raw.customerId ?? raw.customer_id ?? undefined,
    warehouseId: raw.warehouseId ?? raw.warehouse_id ?? undefined,
    originAddress: transformAddress(originAddr),
    destinationAddress: transformAddress(destAddr),
    shipmentIds,
    lineItems: lineItems.map((li) => ({
      id: li.id ?? undefined,
      sku: li.sku ?? undefined,
      name: li.name ?? undefined,
      description: li.description ?? undefined,
      quantity: li.quantity ?? undefined,
      unitAmount: parseDecimal(li.price ?? li.unit_price),
      totalAmount: parseDecimal(li.total),
    })),
    currency: raw.currency ?? undefined,
    subtotalAmount: parseDecimal(raw.subtotal),
    taxAmount: parseDecimal(raw.tax),
    shippingAmount: parseDecimal(raw.shippingCost ?? raw.shipping_cost),
    discountAmount: parseDecimal(raw.discount),
    totalAmount: parseDecimal(raw.total),
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.requestedServiceCode ?? raw.requested_service_code ?? undefined,
    orderAt: toISODate(raw.orderedAt ?? raw.ordered_at),
    shippedAt: toISODate(raw.shippedAt ?? raw.shipped_at),
    deliveredAt: toISODate(raw.deliveredAt ?? raw.delivered_at),
    cancelledAt: toISODate(raw.cancelledAt ?? raw.cancelled_at),
    createdAt: toISODate(raw.createdAt ?? raw.created_at),
    updatedAt: toISODate(raw.updatedAt ?? raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
