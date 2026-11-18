import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'
import type { WondermentShipment } from './tracking'

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(raw: string | null | undefined): ShipmentStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'SHIPMENT_CREATED':
    case 'CONFIRMED':
    case 'PRE_TRANSIT':
      return 'LABEL_CREATED'
    case 'TRANSIT':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'RETURNED':
      return 'RETURNED'
    case 'ERROR':
    case 'ATTEMPTED_DELIVERY':
    case 'SHIPMENT_STALLED':
    case 'CANCELLED':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: WondermentShipment): Shipment {
  return {
    id: raw.id ?? undefined,
    trackingNumber: raw.trackingCode ?? raw.trackingNumber ?? undefined,
    carrierId: raw.carrierName ?? undefined,
    serviceCode: raw.carrierService ?? undefined,
    status: mapShipmentStatus(raw.statusDetails?.status),
    estimatedDeliveryAt: toISODate(raw.packageEta),
    reference: raw.orderName ?? raw.orderId ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
