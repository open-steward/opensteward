import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Canpar raw types ───────────────────────────────────────────────────────

export interface CanparShipment {
  id: string
  barcode?: string | null
  status?: string | null
  service_type?: string | null
  reported_weight?: number | null
  weight_unit?: string | null
  pickup_address?: Record<string, unknown> | null
  delivery_address?: Record<string, unknown> | null
  label_url?: string | null
  user_reference?: string | null
  created_date?: string | null
  updated_date?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'CREATED':
    case 'LABEL_CREATED':       return 'LABEL_CREATED'
    case 'IN_TRANSIT':
    case 'TRANSIT':             return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':    return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':           return 'DELIVERED'
    case 'EXCEPTION':           return 'EXCEPTION'
    case 'RETURNED':            return 'RETURNED'
    case 'CANCELLED':
    case 'VOIDED':              return 'CANCELLED'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: CanparShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.barcode ?? undefined,
    carrierId: 'canpar',
    serviceCode: raw.service_type ?? undefined,
    originAddress: toAddress(raw.pickup_address),
    destinationAddress: toAddress(raw.delivery_address),
    totalWeight: raw.reported_weight != null ? toWeight(raw.reported_weight, weightUnit) : undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.user_reference ?? undefined,
    createdAt: toISODate(raw.created_date),
    updatedAt: toISODate(raw.updated_date),
    metadata: raw as Record<string, unknown>,
  }
}
