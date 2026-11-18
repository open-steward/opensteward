import type { Shipment, ShipmentStatus, OceanFields } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

function portCode(p: Record<string, unknown> | null | undefined): string | undefined {
  if (!p) return undefined
  const v = p.UNLocationCode ?? p.unLocode ?? p.unlocode ?? p.code ?? p.locationCode ?? p.name ?? p.city
  return v == null ? undefined : String(v)
}

export interface SearatesContainer {
  container: string
  bookingNumber?: string | null
  status?: string | null
  pol?: Record<string, unknown> | null
  pod?: Record<string, unknown> | null
  weight?: number | null
  weightUnit?: string | null
  eta?: string | null
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

export function transformShipment(raw: SearatesContainer): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  return {
    id: raw.container,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.container,
    carrierId: 'searates',
    originAddress: toAddress(raw.pol),
    destinationAddress: toAddress(raw.pod),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    reference: raw.bookingNumber ?? undefined,
    estimatedDeliveryAt: toISODate(raw.eta),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    mode: 'ocean',
    ocean: {
      containerNumber: raw.container,
      bookingNumber: raw.bookingNumber ?? undefined,
      portOfLoading: portCode(raw.pol),
      portOfDischarge: portCode(raw.pod),
      estimatedArrival: toISODate(raw.eta),
    } satisfies OceanFields,
    metadata: raw as Record<string, unknown>,
  }
}
