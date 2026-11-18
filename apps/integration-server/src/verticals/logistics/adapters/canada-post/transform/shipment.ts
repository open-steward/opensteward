import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Canada Post raw types ──────────────────────────────────────────────────

export interface CanadaPostShipment {
  'shipment-id': string
  'tracking-pin'?: string | null
  status?: string | null
  'service-code'?: string | null
  weight?: number | null
  'weight-unit'?: string | null
  sender?: Record<string, unknown> | null
  delivery?: Record<string, unknown> | null
  'label-url'?: string | null
  reference?: string | null
  'created-at'?: string | null
  'updated-at'?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'created':
    case 'CREATED':             return 'LABEL_CREATED'
    case 'transmitted':
    case 'in-transit':
    case 'IN_TRANSIT':          return 'IN_TRANSIT'
    case 'out-for-delivery':
    case 'OUT_FOR_DELIVERY':    return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'DELIVERED':           return 'DELIVERED'
    case 'exception':
    case 'EXCEPTION':           return 'EXCEPTION'
    case 'returned':
    case 'RETURNED':            return 'RETURNED'
    case 'cancelled':
    case 'voided':
    case 'CANCELLED':           return 'CANCELLED'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: CanadaPostShipment): Shipment {
  const weightUnit = (raw['weight-unit']?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw['shipment-id'],
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw['tracking-pin'] ?? undefined,
    carrierId: 'canada-post',
    serviceCode: raw['service-code'] ?? undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.delivery),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    labelUrl: raw['label-url'] ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw['created-at']),
    updatedAt: toISODate(raw['updated-at']),
    metadata: raw as Record<string, unknown>,
  }
}
