import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── SMSA raw types ────────────────────────────────────────────────────────

export interface SmsaShipment {
  awbno: string
  status: string | null
  label_url: string | null
  service_code: string | null
  weight: number | null
  weight_unit: string | null
  sender: Record<string, unknown> | null
  recipient: Record<string, unknown> | null
  reference: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'RECEIVED':            return 'PENDING'
    case 'IN_HUB':              return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':    return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':           return 'DELIVERED'
    case 'NOT_DELIVERED':       return 'EXCEPTION'
    case 'RETURNED':            return 'RETURNED'
    case 'HELD':                return 'PENDING'
    case 'CANCELLED':           return 'CANCELLED'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformShipment(raw: SmsaShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.awbno,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.awbno ?? undefined,
    carrierId: 'smsa',
    serviceCode: raw.service_code ?? undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
