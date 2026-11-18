import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── BRT raw types ─────────────────────────────────────────────────────────

export interface BrtShipment {
  shipment_id: string
  tracking_number: string
  status: string | null
  service_code: string | null
  weight: number | null
  weight_unit: string | null
  sender: Record<string, unknown> | null
  recipient: Record<string, unknown> | null
  label_url: string | null
  reference: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'RITIRATO':              return 'PENDING'
    case 'IN_TRANSITO':           return 'IN_TRANSIT'
    case 'IN_CONSEGNA':           return 'OUT_FOR_DELIVERY'
    case 'CONSEGNATO':            return 'DELIVERED'
    case 'MANCATA_CONSEGNA':      return 'EXCEPTION'
    case 'RESO':                  return 'RETURNED'
    case 'ANNULLATO':             return 'CANCELLED'
    default:                      return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: BrtShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.shipment_id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'brt',
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
