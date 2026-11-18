import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Mondial Relay raw types ───────────────────────────────────────────────

export interface MondialRelayLabel {
  data: string
  format: string
  [key: string]: unknown
}

export interface MondialRelayShipment {
  shipment_id: string
  tracking_number: string
  status: string | null
  service_code: string | null
  weight: number | null
  weight_unit: string | null
  sender: Record<string, unknown> | null
  recipient: Record<string, unknown> | null
  relay_point_id: string | null
  label_url: string | null
  labels: MondialRelayLabel[] | null
  reference: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'PRIS_EN_CHARGE':             return 'PENDING'
    case 'EN_TRANSIT':                 return 'IN_TRANSIT'
    case 'DISPONIBLE_POINT_RELAIS':    return 'IN_TRANSIT'
    case 'LIVRE':                      return 'DELIVERED'
    case 'NON_LIVRE':                  return 'EXCEPTION'
    case 'RETOUR':                     return 'RETURNED'
    case 'ANNULE':                     return 'CANCELLED'
    default:                           return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: MondialRelayShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.shipment_id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'mondialrelay',
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
