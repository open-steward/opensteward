import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toDimensions, toISODate } from '../../shared/transform'

// ─── GLS-DE raw types ─────────────────────────────────────────────────────

export interface GlsDeParcel {
  parcelNumber: string
  trackId: string
  weight: number | null
  [key: string]: unknown
}

export interface GlsDeShipment {
  shipmentId: string
  status: string
  consignmentId: string | null
  parcels: GlsDeParcel[]
  sender: Record<string, unknown> | null
  receiver: Record<string, unknown> | null
  shipper: Record<string, unknown> | null
  weight: number | null
  weightUnit: string | null
  length: number | null
  width: number | null
  height: number | null
  dimensionUnit: string | null
  product: string | null
  serviceCode: string | null
  reference: string | null
  labelUrl: string | null
  labels: GlsDeLabel[] | null
  createdAt: string | null
  [key: string]: unknown
}

export interface GlsDeLabel {
  data: string
  format: string
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string): ShipmentStatus {
  switch (status) {
    case 'PREADVICE':
    case 'CREATED':        return 'PENDING'
    case 'INTRANSIT':      return 'IN_TRANSIT'
    case 'INDELIVERY':     return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':      return 'DELIVERED'
    case 'RETURNED':       return 'RETURNED'
    case 'CANCELLED':      return 'CANCELLED'
    case 'EXCEPTION':      return 'EXCEPTION'
    default:               return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: GlsDeShipment): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  const dimUnit = (raw.dimensionUnit?.toLowerCase() === 'in' ? 'in' : 'cm') as 'in' | 'cm'

  return {
    id: raw.shipmentId,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.parcels?.[0]?.trackId ?? raw.consignmentId ?? undefined,
    carrierId: 'gls-de',
    serviceCode: raw.serviceCode ?? raw.product ?? undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.receiver),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    dimensions: raw.length != null && raw.width != null && raw.height != null
      ? toDimensions(raw.length, raw.width, raw.height, dimUnit)
      : undefined,
    labelUrl: raw.labelUrl ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
