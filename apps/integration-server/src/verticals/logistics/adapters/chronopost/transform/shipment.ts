import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Chronopost raw types ──────────────────────────────────────────────────

export interface ChronopostShipment {
  skybillNumber: string
  status: string | null
  trackingNumber: string | null
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
    case 'PRISE_EN_CHARGE':    return 'PENDING'
    case 'EN_COURS':           return 'IN_TRANSIT'
    case 'EN_LIVRAISON':       return 'OUT_FOR_DELIVERY'
    case 'LIVRE':              return 'DELIVERED'
    case 'ECHEC_LIVRAISON':    return 'EXCEPTION'
    case 'RETOUR':             return 'RETURNED'
    case 'ANOMALIE':           return 'EXCEPTION'
    case 'ANNULE':             return 'CANCELLED'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformShipment(raw: ChronopostShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.skybillNumber,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'chronopost',
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
