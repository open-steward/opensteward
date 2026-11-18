import type { Shipment, ShipmentStatus, OceanFields } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

function portCode(p: Record<string, unknown> | null | undefined): string | undefined {
  if (!p) return undefined
  const v = p.UNLocationCode ?? p.unLocode ?? p.unlocode ?? p.un_locode ?? p.code ?? p.locationCode ?? p.name ?? p.city
  return v == null ? undefined : String(v)
}

export interface VizionContainer {
  container_number: string
  bill_of_lading?: string | null
  status?: string | null
  vessel_name?: string | null
  voyage_number?: string | null
  port_of_loading?: Record<string, unknown> | null
  port_of_discharge?: Record<string, unknown> | null
  weight?: number | null
  weight_unit?: string | null
  estimated_arrival_at?: string | null
  created_at?: string | null
  updated_at?: string | null
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

export function transformShipment(raw: VizionContainer): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  return {
    id: raw.container_number,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.container_number,
    carrierId: 'vizion',
    originAddress: toAddress(raw.port_of_loading),
    destinationAddress: toAddress(raw.port_of_discharge),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    reference: raw.bill_of_lading ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_arrival_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    mode: 'ocean',
    ocean: {
      containerNumber: raw.container_number,
      billOfLadingNumber: raw.bill_of_lading ?? undefined,
      vesselName: raw.vessel_name ?? undefined,
      voyageNumber: raw.voyage_number ?? undefined,
      portOfLoading: portCode(raw.port_of_loading),
      portOfDischarge: portCode(raw.port_of_discharge),
      estimatedArrival: toISODate(raw.estimated_arrival_at),
    } satisfies OceanFields,
    metadata: raw as Record<string, unknown>,
  }
}
