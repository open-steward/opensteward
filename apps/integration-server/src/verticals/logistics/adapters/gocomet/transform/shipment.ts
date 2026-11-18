import type { Shipment, ShipmentStatus, OceanFields } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface GoCometContainer {
  id?: string | null
  container_number?: string | null
  booking_number?: string | null
  bill_of_lading?: string | null
  status?: string | null
  vessel_name?: string | null
  voyage_number?: string | null
  shipping_line?: string | null
  container_type?: string | null
  seal_number?: string | null
  origin_port?: Record<string, unknown> | null
  destination_port?: Record<string, unknown> | null
  origin_address?: Record<string, unknown> | null
  destination_address?: Record<string, unknown> | null
  weight?: number | null
  weight_unit?: string | null
  eta?: string | null
  etd?: string | null
  actual_arrival?: string | null
  actual_departure?: string | null
  reference?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface GoCometShipmentListResponse {
  data?: GoCometContainer[]
  shipments?: GoCometContainer[]
  [key: string]: unknown
}

function portCode(p: Record<string, unknown> | null | undefined): string | undefined {
  if (!p) return undefined
  const v =
    p.un_locode ??
    p.unLocode ??
    p.unlocode ??
    p.locode ??
    p.code ??
    p.location_code ??
    p.name ??
    p.city
  return v == null ? undefined : String(v)
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s.includes('DELIVERED') || s.includes('DELIVERY_DONE')) return 'DELIVERED'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('EXCEPTION') || s.includes('FAIL') || s.includes('DELAY')) return 'EXCEPTION'
  if (
    s.includes('TRANSIT') ||
    s.includes('LOADED') ||
    s.includes('DISCHARG') ||
    s.includes('IN_PROGRESS') ||
    s.includes('SAILING') ||
    s.includes('DEPARTED')
  )
    return 'IN_TRANSIT'
  if (s.includes('BOOK') || s.includes('CREATED') || s.includes('PENDING')) return 'LABEL_CREATED'
  if (s.includes('OUT_FOR_DELIVERY') || s.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY'
  return 'UNKNOWN'
}

export function transformShipment(raw: GoCometContainer): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  const ocean: OceanFields = {
    containerNumber: raw.container_number ?? undefined,
    containerType: raw.container_type ?? undefined,
    bookingNumber: raw.booking_number ?? undefined,
    billOfLadingNumber: raw.bill_of_lading ?? undefined,
    vesselName: raw.vessel_name ?? undefined,
    voyageNumber: raw.voyage_number ?? undefined,
    shippingLine: raw.shipping_line ?? undefined,
    sealNumber: raw.seal_number ?? undefined,
    portOfLoading: portCode(raw.origin_port),
    portOfDischarge: portCode(raw.destination_port),
    estimatedDeparture: toISODate(raw.etd),
    estimatedArrival: toISODate(raw.eta),
    actualDeparture: toISODate(raw.actual_departure),
    actualArrival: toISODate(raw.actual_arrival),
  }

  return {
    id: raw.id ?? raw.container_number ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.container_number ?? undefined,
    carrierId: 'gocomet',
    originAddress: toAddress(raw.origin_address),
    destinationAddress: toAddress(raw.destination_address),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    reference: raw.bill_of_lading ?? raw.booking_number ?? raw.reference ?? undefined,
    estimatedDeliveryAt: toISODate(raw.eta),
    actualDeliveryAt: toISODate(raw.actual_arrival),
    mode: 'ocean',
    ocean,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
