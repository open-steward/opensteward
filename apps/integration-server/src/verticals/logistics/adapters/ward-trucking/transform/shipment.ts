import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Ward Trucking raw types ─────────────────────────────────────────────────────

export interface WardTruckingShipment {
  id: string
  tracking_number?: string | null
  status?: string | null
  service_code?: string | null
  weight?: number | null
  weight_unit?: string | null
  sender?: Record<string, unknown> | null
  recipient?: Record<string, unknown> | null
  label_url?: string | null
  reference?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const v = status.toUpperCase()
  if (v === 'CREATED' || v === 'LABEL_CREATED' || v === 'PENDING' || v === 'INFORMED' || v === 'MANIFESTED') return 'LABEL_CREATED'
  if (v === 'IN_TRANSIT' || v === 'EN_ROUTE' || v.includes('TRANSIT')) return 'IN_TRANSIT'
  if (v === 'OUT_FOR_DELIVERY' || v.includes('OUT_FOR_DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (v === 'DELIVERED') return 'DELIVERED'
  if (v === 'EXCEPTION' || v === 'STOPPED' || v.includes('FAIL')) return 'EXCEPTION'
  if (v === 'RETURNED' || v.includes('RETURN')) return 'RETURNED'
  if (v === 'CANCELLED' || v === 'CANCELED') return 'CANCELLED'
  return 'UNKNOWN'
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: WardTruckingShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'ward-trucking',
    serviceCode: raw.service_code ?? undefined,
    originAddress: toAddress(raw.sender ?? null),
    destinationAddress: toAddress(raw.recipient ?? null),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
