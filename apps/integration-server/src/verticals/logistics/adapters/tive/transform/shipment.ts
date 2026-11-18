import type { Shipment, ShipmentStatus, OceanFields } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

function portCode(p: Record<string, unknown> | null | undefined): string | undefined {
  if (!p) return undefined
  const v = p.UNLocationCode ?? p.unLocode ?? p.unlocode ?? p.code ?? p.locationCode ?? p.name ?? p.city
  return v == null ? undefined : String(v)
}

export interface TiveContainer {
  trackerId: string
  shipmentId?: string | null
  status?: string | null
  origin?: Record<string, unknown> | null
  destination?: Record<string, unknown> | null
  weight?: number | null
  weightUnit?: string | null
  estimatedArrival?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s.includes('DELIVERED')) return 'DELIVERED'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('EXCEPTION') || s.includes('FAIL') || s.includes('ALERT')) return 'EXCEPTION'
  if (s.includes('TRANSIT') || s.includes('LOADED') || s.includes('DISCHARG')) return 'IN_TRANSIT'
  if (s.includes('BOOK') || s.includes('CREATED')) return 'LABEL_CREATED'
  return 'UNKNOWN'
}

export function transformShipment(raw: TiveContainer): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  return {
    id: raw.trackerId,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackerId,
    carrierId: 'tive',
    originAddress: toAddress(raw.origin),
    destinationAddress: toAddress(raw.destination),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    reference: raw.shipmentId ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedArrival),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    mode: 'ocean',
    ocean: {
      containerNumber: raw.trackerId,
      bookingNumber: raw.shipmentId ?? undefined,
      portOfLoading: portCode(raw.origin),
      portOfDischarge: portCode(raw.destination),
      estimatedArrival: toISODate(raw.estimatedArrival),
    } satisfies OceanFields,
    metadata: raw as Record<string, unknown>,
  }
}
