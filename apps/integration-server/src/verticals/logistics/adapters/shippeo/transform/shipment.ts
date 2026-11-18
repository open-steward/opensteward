import type { Shipment, ShipmentStatus, ShipmentMode } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRANSPORT_MODE_MAP } from '../constants'

// ── Shippeo raw types ─────────────────────────────────────────────────────────

export interface ShippeoAddress {
  name?: string | null
  company?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface ShippeoShipmentResponse {
  id?: string | null
  reference?: string | null
  external_reference?: string | null
  tracking_number?: string | null
  status?: string | null
  transport_mode?: string | null
  carrier_code?: string | null
  service_code?: string | null
  origin?: ShippeoAddress | null
  destination?: ShippeoAddress | null
  estimated_delivery_at?: string | null
  actual_delivery_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface ShippeoShipmentsListResponse {
  data?: ShippeoShipmentResponse[] | null
  results?: ShippeoShipmentResponse[] | null
  items?: ShippeoShipmentResponse[] | null
  total?: number | null
  page?: number | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  switch (status.toUpperCase()) {
    case 'CREATED':
    case 'BOOKED':
    case 'ORDER_CREATED':
      return 'PENDING'
    case 'IN_TRANSIT':
    case 'DEPARTED':
    case 'ARRIVAL':
    case 'PICKED_UP':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
    case 'DELIVERY_CONFIRMED':
      return 'DELIVERED'
    case 'EXCEPTION':
    case 'DELAYED':
    case 'LOST':
    case 'DAMAGED':
      return 'EXCEPTION'
    case 'RETURNED':
    case 'RETURN_TO_SENDER':
      return 'RETURNED'
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

function mapMode(mode: string | null | undefined): ShipmentMode | undefined {
  if (!mode) return undefined
  const upper = mode.toUpperCase()
  return (TRANSPORT_MODE_MAP[upper] as ShipmentMode | undefined) ?? undefined
}

function toAddress(raw: ShippeoAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.street1 ?? undefined,
    street2: raw.street2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postal_code ?? undefined,
    country: raw.country ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformShipment(raw: ShippeoShipmentResponse): Shipment {
  return {
    id: raw.id ?? undefined,
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier_code ?? 'shippeo',
    serviceCode: raw.service_code ?? undefined,
    reference: raw.reference ?? raw.external_reference ?? undefined,
    mode: mapMode(raw.transport_mode),
    originAddress: toAddress(raw.origin),
    destinationAddress: toAddress(raw.destination),
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    actualDeliveryAt: toISODate(raw.actual_delivery_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Extract the shipment array from the various list-response shapes Shippeo
 * may return (`data`, `results`, or `items`).
 */
export function extractShipments(res: ShippeoShipmentsListResponse): ShippeoShipmentResponse[] {
  return res.data ?? res.results ?? res.items ?? []
}
