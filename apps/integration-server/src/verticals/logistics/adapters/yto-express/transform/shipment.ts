import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── YTO Express raw types ─────────────────────────────────────────────────

export interface YtoExpressOrder {
  order_id: string
  tracking_number: string
  status: string | null
  label_url: string | null
  service_code: string | null
  weight: number | null
  weight_unit: string | null
  sender: Record<string, unknown> | null
  recipient: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'GOT':        return 'PENDING'
    case 'DEPARTURE':  return 'IN_TRANSIT'
    case 'ARRIVAL':    return 'IN_TRANSIT'
    case 'DELIVERING': return 'OUT_FOR_DELIVERY'
    case 'SIGNED':     return 'DELIVERED'
    case 'PROBLEM':    return 'EXCEPTION'
    case 'RETURN':     return 'RETURNED'
    case 'CANCELLED':  return 'CANCELLED'
    default:           return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: YtoExpressOrder): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.order_id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'yto-express',
    serviceCode: raw.service_code ?? undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    labelUrl: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
