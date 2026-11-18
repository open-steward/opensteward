import type { Shipment, ShipmentStatus, OceanFields } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

function portCode(p: Record<string, unknown> | null | undefined): string | undefined {
  if (!p) return undefined
  const v = p.UNLocationCode ?? p.unLocode ?? p.unlocode ?? p.code ?? p.locationCode ?? p.name ?? p.locationName ?? p.city
  return v == null ? undefined : String(v)
}

export interface HapagLloydContainer {
  containerNumber: string
  bookingNumber?: string | null
  status?: string | null
  vesselName?: string | null
  voyageNumber?: string | null
  portOfLoading?: Record<string, unknown> | null
  portOfDischarge?: Record<string, unknown> | null
  weight?: number | null
  weightUnit?: string | null
  estimatedTimeOfArrival?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s.includes('DELIVERED')) return 'DELIVERED'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('EXCEPTION') || s.includes('FAIL')) return 'EXCEPTION'
  if (s.includes('TRANSIT') || s.includes('LOADED') || s.includes('DISCHARG')) return 'IN_TRANSIT'
  if (s.includes('BOOK') || s.includes('CREATED')) return 'LABEL_CREATED'
  return 'UNKNOWN'
}

export function transformShipment(raw: HapagLloydContainer): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  return {
    id: raw.containerNumber,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.containerNumber,
    carrierId: 'hapag-lloyd',
    originAddress: toAddress(raw.portOfLoading),
    destinationAddress: toAddress(raw.portOfDischarge),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    reference: raw.bookingNumber ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedTimeOfArrival),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    mode: 'ocean',
    ocean: {
      containerNumber: raw.containerNumber,
      bookingNumber: raw.bookingNumber ?? undefined,
      vesselName: raw.vesselName ?? undefined,
      voyageNumber: raw.voyageNumber ?? undefined,
      shippingLine: 'Hapag-Lloyd',
      portOfLoading: portCode(raw.portOfLoading),
      portOfDischarge: portCode(raw.portOfDischarge),
      estimatedArrival: toISODate(raw.estimatedTimeOfArrival),
    } satisfies OceanFields,
    metadata: raw as Record<string, unknown>,
  }
}
