import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'
import type { JanioOrder } from './shipment'

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null): OrderStatus {
  switch (status) {
    case 'CREATED':          return 'PENDING'
    case 'PICKED_UP':        return 'PROCESSING'
    case 'IN_TRANSIT':       return 'SHIPPED'
    case 'CUSTOMS':          return 'SHIPPED'
    case 'OUT_FOR_DELIVERY': return 'SHIPPED'
    case 'DELIVERED':        return 'DELIVERED'
    case 'FAILED':           return 'RETURNED'
    case 'RETURNED':         return 'RETURNED'
    case 'CANCELLED':        return 'CANCELLED'
    default:                 return 'PENDING'
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: JanioOrder): Order {
  return {
    id: raw.order_id,
    status: mapOrderStatus(raw.status),
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    requestedServiceCode: raw.service_code ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
