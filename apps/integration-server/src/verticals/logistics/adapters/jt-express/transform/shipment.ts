import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── J&T Express raw types ─────────────────────────────────────────────────

export interface JtExpressOrder {
  order_id: string
  bill_code: string
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

// ─── Status mapping ────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'PICKUP':        return 'PENDING'
    case 'INBOUND':       return 'IN_TRANSIT'
    case 'OUTBOUND':      return 'IN_TRANSIT'
    case 'DELIVERING':    return 'OUT_FOR_DELIVERY'
    case 'SIGNED':        return 'DELIVERED'
    case 'PROBLEMATIC':   return 'EXCEPTION'
    case 'RETURNING':     return 'RETURNED'
    case 'CANCELLED':     return 'CANCELLED'
    default:              return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformShipment(raw: JtExpressOrder): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.order_id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.bill_code ?? undefined,
    carrierId: 'jt-express',
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
