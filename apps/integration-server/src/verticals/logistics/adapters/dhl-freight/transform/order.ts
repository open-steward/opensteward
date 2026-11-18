import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * Raw response shape from POST api.dhl.com/freight/shipping/orders/v1
 * (DHL Freight Shipment Booking API — 2026/R03 product manual).
 * After successful booking, DHL returns the unique shipmentId and pieces.
 */
export interface DhlFreightOrderRaw {
  shipmentId: string
  orderId: string | null
  orderNumber: string | null
  status: string | null
  serviceCode: string | null
  productCode: string | null
  sender: Record<string, unknown> | null
  recipient: Record<string, unknown> | null
  pieces: Array<{ id: string | null; [key: string]: unknown }> | null
  currency: string | null
  totalAmount: number | null
  shippingAmount: number | null
  reference: string | null
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null): OrderStatus {
  const key = (status ?? '').toLowerCase()
  switch (key) {
    case 'pending':
    case 'received':          return 'PENDING'
    case 'processing':        return 'PROCESSING'
    case 'on_hold':
    case 'onhold':            return 'ON_HOLD'
    case 'awaiting_shipment':
    case 'booked':
    case 'label_created':     return 'AWAITING_SHIPMENT'
    case 'shipped':
    case 'in_transit':
    case 'transit':           return 'SHIPPED'
    case 'delivered':         return 'DELIVERED'
    case 'cancelled':
    case 'canceled':          return 'CANCELLED'
    case 'returned':
    case 'return_to_sender':  return 'RETURNED'
    default:                  return 'UNKNOWN'
  }
}

export function transformOrder(raw: DhlFreightOrderRaw): Order {
  return {
    id: raw.orderId ?? raw.shipmentId,
    orderNumber: raw.orderNumber ?? raw.shipmentId,
    status: mapOrderStatus(raw.status),
    requestedServiceCode: raw.serviceCode ?? raw.productCode ?? undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    currency: raw.currency ?? undefined,
    totalAmount: raw.totalAmount ?? undefined,
    shippingAmount: raw.shippingAmount ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
