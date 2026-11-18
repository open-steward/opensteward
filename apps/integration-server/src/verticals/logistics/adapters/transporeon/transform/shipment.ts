import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRANSPORT_QUALIFIER_STATUS_MAP } from '../constants'

// ── Raw Transporeon transport DTO shapes ──────────────────────────────────────

export interface TransporeonStation {
  id?: string | number
  type?: string          // "loading" | "unloading"
  shipment_id?: string | number
  company_name?: string
  address?: string
  zip?: string
  city?: string
  region?: string
  country_id?: string
  from_date?: string
  from_time?: string
  until_date?: string
  until_time?: string
  [key: string]: unknown
}

export interface TransporeonShipmentDto {
  id?: string | number
  index?: number
  tour_id?: string | number
  number?: string | number
  weight?: number
  weight_unit?: string
  volume?: number
  volume_unit?: string
  route?: number
  route_unit?: string
  comment_plain_text?: string
  customer_name?: string
  station?: TransporeonStation[]
  [key: string]: unknown
}

export interface TransporeonTransportDto {
  id?: string | number
  timestamp?: string
  document_reference?: string
  number?: string | number
  external_transport_number?: string
  tpw_link?: string
  status?: string
  qualifier?: string
  company_id?: string | number
  company_name?: string
  company_address?: string
  company_zip_address?: string
  company_city?: string
  company_country_id?: string
  vehicle_id?: string
  vehicle_name?: string
  start_date?: string
  start_time?: string
  end_date?: string
  end_time?: string
  start_country_id?: string
  start_zip?: string
  start_city?: string
  end_country_id?: string
  end_zip?: string
  end_city?: string
  price_basic?: number | null
  currency_id?: string
  assigned_carrier_id?: string | number
  assigned_carrier_name?: string
  weight?: number
  weight_unit?: string
  volume?: number
  volume_unit?: string
  comment_plain_text?: string
  shipments?: TransporeonShipmentDto[]
  pull_id?: string
  [key: string]: unknown
}

/** API list response: either { transport: [...] } or { transports: [...] } */
export interface TransporeonTransportListResponse {
  pull_id?: string
  transport?: TransporeonTransportDto[]
  transports?: TransporeonTransportDto[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapShipmentStatus(qualifier: string | undefined): ShipmentStatus {
  if (!qualifier) return 'UNKNOWN'
  return (TRANSPORT_QUALIFIER_STATUS_MAP[qualifier] as ShipmentStatus) ?? 'UNKNOWN'
}

function buildDatetime(date?: string, time?: string): Date | undefined {
  if (!date) return undefined
  const dt = time ? `${date}T${time}` : date
  return toISODate(dt)
}

function firstStation(
  stations: TransporeonStation[] | undefined,
  type: 'loading' | 'unloading',
): TransporeonStation | undefined {
  return stations?.find((s) => s.type === type)
}

function toStationAddress(station: TransporeonStation | undefined): Address | undefined {
  if (!station) return undefined
  const hasAny = station.company_name || station.zip || station.city || station.country_id
  if (!hasAny) return undefined
  return {
    company: station.company_name ?? undefined,
    street1: station.address ?? undefined,
    city: station.city ?? undefined,
    state: station.region ?? undefined,
    postalCode: station.zip ?? undefined,
    country: station.country_id ?? undefined,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

/**
 * Transform a single Transporeon transport DTO into the canonical Shipment shape.
 * Each transport order maps to one Shipment; individual deliveries (shipments[])
 * are surfaced via metadata.
 */
export function transformTransport(raw: TransporeonTransportDto): Shipment {
  const id = raw.id !== undefined ? String(raw.id) : undefined
  const firstDelivery = raw.shipments?.[0]

  // Origin: loading station of first delivery, or start address from transport header
  const originStation = firstStation(firstDelivery?.station, 'loading')
  const originAddress: Address | undefined =
    toStationAddress(originStation) ??
    (raw.start_city || raw.start_zip || raw.start_country_id
      ? {
          city: raw.start_city ?? undefined,
          postalCode: raw.start_zip ?? undefined,
          country: raw.start_country_id ?? undefined,
        }
      : undefined)

  // Destination: unloading station of last delivery, or end address from transport header
  const lastDelivery = raw.shipments && raw.shipments.length > 0
    ? raw.shipments[raw.shipments.length - 1]
    : undefined
  const destStation = firstStation(lastDelivery?.station, 'unloading')
  const destinationAddress: Address | undefined =
    toStationAddress(destStation) ??
    (raw.end_city || raw.end_zip || raw.end_country_id
      ? {
          city: raw.end_city ?? undefined,
          postalCode: raw.end_zip ?? undefined,
          country: raw.end_country_id ?? undefined,
        }
      : undefined)

  const estimatedDeliveryAt = buildDatetime(raw.end_date, raw.end_time)
  const createdAt = toISODate(raw.timestamp) ?? toISODate(new Date().toISOString())

  const totalWeight =
    raw.weight != null && raw.weight > 0
      ? {
          value: raw.weight,
          unit: (raw.weight_unit === 'kg' ? 'kg' : 'kg') as 'kg',
        }
      : undefined

  const cost =
    raw.price_basic != null && raw.price_basic > 0 && raw.currency_id
      ? {
          amount: Math.round(raw.price_basic * 100),
          currency: raw.currency_id as string,
        }
      : undefined

  return {
    id,
    status: mapShipmentStatus(raw.qualifier),
    trackingNumber: raw.external_transport_number || (id ?? undefined),
    carrierId: raw.assigned_carrier_name
      ? raw.assigned_carrier_name.toLowerCase().replace(/\s+/g, '-')
      : 'transporeon',
    serviceCode: raw.vehicle_name ?? undefined,
    originAddress,
    destinationAddress,
    estimatedDeliveryAt,
    createdAt,
    updatedAt: toISODate(raw.timestamp),
    totalWeight,
    cost,
    reference: raw.number !== undefined ? String(raw.number) : undefined,
    notes: raw.comment_plain_text ?? undefined,
    mode: 'ftl',
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Extract the array of transport DTOs from the API list response shape.
 */
export function extractTransports(
  res: TransporeonTransportListResponse,
): TransporeonTransportDto[] {
  return res.transport ?? res.transports ?? []
}
