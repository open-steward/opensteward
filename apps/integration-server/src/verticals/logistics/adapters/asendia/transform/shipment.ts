import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Asendia raw types ─────────────────────────────────────────────────────

export interface AsendiaShipment {
  shipment_id: string
  tracking_number: string
  status: string | null
  service_code: string | null
  weight: number | null
  weight_unit: string | null
  sender: Record<string, unknown> | null
  recipient: Record<string, unknown> | null
  destination_country: string | null
  reference: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'POSTED':             return 'PENDING'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'CUSTOMS':            return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':   return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':          return 'DELIVERED'
    case 'RETURNED':           return 'RETURNED'
    case 'EXCEPTION':          return 'EXCEPTION'
    case 'CANCELLED':          return 'CANCELLED'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: AsendiaShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'g') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.shipment_id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'asendia',
    serviceCode: raw.service_code ?? undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
