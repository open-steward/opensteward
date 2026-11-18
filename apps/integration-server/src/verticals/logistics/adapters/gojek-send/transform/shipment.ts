import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface GojekSendShipmentRaw {
  id?: string
  shipment_id?: string
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

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s.includes('DELIVERED')) return 'DELIVERED'
  if (s.includes('OUT_FOR_DELIVERY') || s.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (s.includes('TRANSIT')) return 'IN_TRANSIT'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('RETURN')) return 'RETURNED'
  if (s.includes('EXCEPTION') || s.includes('FAIL')) return 'EXCEPTION'
  if (s.includes('CREATED') || s.includes('LABEL') || s.includes('MANIFEST')) return 'LABEL_CREATED'
  return 'UNKNOWN'
}

export function transformShipment(raw: GojekSendShipmentRaw): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  return {
    id: raw.id ?? raw.shipment_id ?? '',
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'gojek-send',
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
