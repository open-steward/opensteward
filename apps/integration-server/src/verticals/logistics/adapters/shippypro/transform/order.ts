import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'
import { transformAddress, type ShippyProAddress } from './address'
import type { ShippyProOrderDetail } from './shipment'

/**
 * ShippyPro order object — typically returned as part of a list or fetch call.
 * ShippyPro maps orders to shipments 1:1 so most fields mirror ShippyProShipment.
 */
export interface ShippyProOrder {
  OrderId?: string | null
  TransactionId?: string | null
  Reference?: string | null
  Status?: string | null
  CarrierName?: string | null
  TrackingNumber?: string | null
  ToAddress?: ShippyProAddress | null
  FromAddress?: ShippyProAddress | null
  ShipDate?: string | null
  DeliveryDate?: string | null
  CreatedAt?: string | null
  UpdatedAt?: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'processing':
      return 'PROCESSING'
    case 'on_hold':
      return 'ON_HOLD'
    case 'awaiting_shipment':
    case 'label_created':
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
    case 'return_to_sender':
      return 'RETURNED'
    default:
      return 'PENDING'
  }
}

export function transformOrder(raw: ShippyProOrder): Order {
  const shipmentId = raw.TransactionId ?? undefined
  return {
    id: raw.OrderId ?? raw.TransactionId ?? undefined,
    status: mapOrderStatus(raw.Status),
    orderNumber: raw.Reference ?? raw.OrderId ?? undefined,
    shipmentIds: shipmentId ? [shipmentId] : undefined,
    originAddress: raw.FromAddress ? transformAddress(raw.FromAddress) : undefined,
    destinationAddress: raw.ToAddress ? transformAddress(raw.ToAddress) : undefined,
    shippedAt: toISODate(raw.ShipDate),
    deliveredAt: toISODate(raw.DeliveryDate),
    createdAt: toISODate(raw.CreatedAt),
    updatedAt: toISODate(raw.UpdatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * `GetOrder` ("Retrieves order or shipment details") as an Order, from the
 * documented `GetOrderResponse` fields only. ShippyPro gives an order and its
 * shipment the one `OrderID`, so `getShipment` reads the same id back.
 *
 * `status` is left out: the response's only status is `Status`, "Current
 * tracking status.", which says where the parcel is, not the order's state.
 */
export function transformOrderDetail(raw: ShippyProOrderDetail): Order {
  return {
    id: raw.OrderID ?? undefined,
    orderNumber: raw.TransactionID || undefined,
    shipmentIds: raw.OrderID ? [raw.OrderID] : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
