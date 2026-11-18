import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── PostNord raw types ─────────────────────────────────────────────────────

export interface PostNordShipment {
  shipmentId: string
  itemId: string | null
  status: string | null
  serviceCode: string | null
  weight: number | null
  weightUnit: string | null
  sender: Record<string, unknown> | null
  recipient: Record<string, unknown> | null
  labelUrl: string | null
  reference: string | null
  createdAt: string | null
  updatedAt: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'CREATED':
    case 'INFORMED':           return 'LABEL_CREATED'
    case 'EN_ROUTE':           return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':   return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':          return 'DELIVERED'
    case 'AVAILABLE_FOR_DELIVERY': return 'IN_TRANSIT'
    case 'STOPPED':
    case 'EXCEPTION':          return 'EXCEPTION'
    case 'RETURNED':           return 'RETURNED'
    case 'CANCELLED':          return 'CANCELLED'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: PostNordShipment): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.shipmentId,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.itemId ?? undefined,
    carrierId: 'postnord',
    serviceCode: raw.serviceCode ?? undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    labelUrl: raw.labelUrl ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
