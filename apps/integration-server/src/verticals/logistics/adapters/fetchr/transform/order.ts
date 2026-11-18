import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'
import type { FetchrShipment } from './shipment'

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null): OrderStatus {
  switch (status) {
    case 'CREATED':             return 'PENDING'
    case 'PICKED_UP':           return 'PROCESSING'
    case 'IN_TRANSIT':          return 'AWAITING_SHIPMENT'
    case 'OUT_FOR_DELIVERY':    return 'SHIPPED'
    case 'DELIVERED':           return 'DELIVERED'
    case 'FAILED':              return 'RETURNED'
    case 'RETURNED':            return 'RETURNED'
    case 'CANCELLED':           return 'CANCELLED'
    case 'ON_HOLD':             return 'ON_HOLD'
    default:                    return 'PENDING'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────
//
// Fetchr does not have a separate Order resource — an "order" in their API is
// the same object as a shipment (POST /orders returns a FetchrShipment).  This
// transform projects that shared shape onto the canonical Order type.

export function transformOrder(raw: FetchrShipment): Order {
  return {
    id: raw.orderId,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.reference ?? undefined,
    shipmentIds: raw.trackingId ? [raw.trackingId] : undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    requestedServiceCode: raw.service_code ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
