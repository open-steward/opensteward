import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Freightos raw types ───────────────────────────────────────────────────

export interface FreightosShipment {
  shipment_id: string
  booking_reference: string | null
  tracking_number: string | null
  status: string | null
  mode: string | null
  service_code: string | null
  weight: number | null
  weight_unit: string | null
  origin: Record<string, unknown> | null
  destination: Record<string, unknown> | null
  reference: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'BOOKED':             return 'PENDING'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'AT_PORT':            return 'IN_TRANSIT'
    case 'CUSTOMS':            return 'IN_TRANSIT'
    case 'DELIVERED':          return 'DELIVERED'
    case 'EXCEPTION':          return 'EXCEPTION'
    case 'CANCELLED':          return 'CANCELLED'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: FreightosShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.shipment_id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? raw.booking_reference ?? undefined,
    carrierId: 'freightos',
    serviceCode: raw.service_code ?? raw.mode ?? undefined,
    originAddress: toAddress(raw.origin),
    destinationAddress: toAddress(raw.destination),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
