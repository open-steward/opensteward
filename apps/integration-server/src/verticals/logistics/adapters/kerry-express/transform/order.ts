import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'
import type { KerryExpressShipment } from './shipment'

// ─── Kerry Express raw types ──────────────────────────────────────────────

/**
 * Kerry Express has no dedicated order endpoint. Orders are derived from the
 * shipment creation response (POST /shipments). The same raw shape is reused.
 */
export type KerryExpressOrderRaw = KerryExpressShipment

// ─── Status mapping ────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null): OrderStatus {
  switch (status) {
    case 'PICKED_UP':         return 'AWAITING_SHIPMENT'
    case 'IN_TRANSIT':        return 'SHIPPED'
    case 'OUT_FOR_DELIVERY':  return 'SHIPPED'
    case 'DELIVERED':         return 'DELIVERED'
    case 'FAILED_DELIVERY':   return 'RETURNED'
    case 'RETURNED':          return 'RETURNED'
    case 'CANCELLED':         return 'CANCELLED'
    default:                  return 'PENDING'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformOrder(raw: KerryExpressOrderRaw): Order {
  return {
    id: raw.shipment_id,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.tracking_number ?? raw.shipment_id,
    shipmentIds: raw.tracking_number ? [raw.tracking_number] : undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    requestedServiceCode: raw.service_code ?? undefined,
    metadata: raw as Record<string, unknown>,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
  }
}
