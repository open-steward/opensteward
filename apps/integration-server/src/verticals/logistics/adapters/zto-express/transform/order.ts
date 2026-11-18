import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'
import type { ZtoExpressOrder } from './shipment'

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null): OrderStatus {
  switch (status) {
    case 'COLLECTED':  return 'PROCESSING'
    case 'IN_TRANSIT': return 'SHIPPED'
    case 'DELIVERING': return 'SHIPPED'
    case 'SIGNED':     return 'DELIVERED'
    case 'PROBLEM':    return 'ON_HOLD'
    case 'RETURNED':   return 'RETURNED'
    case 'CANCELLED':  return 'CANCELLED'
    default:           return 'PENDING'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(raw: ZtoExpressOrder): Order {
  return {
    id: raw.order_id,
    orderNumber: raw.order_id,
    status: mapOrderStatus(raw.status),
    shipmentIds: raw.tracking_number ? [raw.tracking_number] : undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    requestedServiceCode: raw.service_code ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
