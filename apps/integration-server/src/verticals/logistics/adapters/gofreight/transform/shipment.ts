import type { Shipment, ShipmentStatus, ShipmentMode } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP } from '../constants'

// ── Raw GoFreight types ──────────────────────────────────────────────────────

export interface GoFreightAddress {
  name?: string
  company?: string
  address?: string
  address2?: string
  city?: string
  state?: string
  zip_code?: string
  country?: string
  phone?: string
  email?: string
  [key: string]: unknown
}

export interface GoFreightContainer {
  container_number?: string
  container_type?: string
  seal_number?: string
  weight?: number
  weight_unit?: string
  [key: string]: unknown
}

export interface GoFreightMasterBill {
  ref?: string
  mbl_number?: string
  hbl_number?: string
  status?: string
  mode?: string
  booking_number?: string
  vessel_name?: string
  voyage_number?: string
  shipping_line?: string
  port_of_loading?: string
  port_of_discharge?: string
  etd?: string
  eta?: string
  atd?: string
  ata?: string
  shipper?: GoFreightAddress
  consignee?: GoFreightAddress
  notify_party?: GoFreightAddress
  containers?: GoFreightContainer[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(raw: string | undefined): ShipmentStatus {
  if (!raw) return 'UNKNOWN'
  return (SHIPMENT_STATUS_MAP[raw.toLowerCase()] as ShipmentStatus) ?? 'UNKNOWN'
}

function mapMode(raw: string | undefined): ShipmentMode {
  if (!raw) return 'unknown'
  const lower = raw.toLowerCase()
  if (lower.includes('ocean') || lower.includes('sea')) return 'ocean'
  if (lower.includes('air')) return 'air'
  if (lower.includes('rail')) return 'rail'
  if (lower.includes('truck') || lower.includes('road')) return 'ftl'
  return 'unknown'
}

function toAddress(raw: GoFreightAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.address ?? undefined,
    street2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.zip_code ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformMasterBill(raw: GoFreightMasterBill): Shipment {
  const firstContainer = raw.containers?.[0]

  return {
    id: raw.ref ?? undefined,
    status: mapStatus(raw.status),
    trackingNumber: raw.mbl_number ?? raw.hbl_number ?? raw.ref ?? undefined,
    carrierId: 'gofreight',
    serviceCode: raw.mode ?? undefined,
    originAddress: toAddress(raw.shipper),
    destinationAddress: toAddress(raw.consignee),
    totalWeight:
      firstContainer?.weight !== undefined && firstContainer.weight !== null
        ? {
            value: Number(firstContainer.weight),
            unit: (firstContainer.weight_unit?.toLowerCase() as 'kg' | 'lb') ?? 'kg',
          }
        : undefined,
    estimatedDeliveryAt: toISODate(raw.eta),
    actualDeliveryAt: toISODate(raw.ata),
    mode: mapMode(raw.mode),
    ocean: {
      containerNumber: firstContainer?.container_number ?? undefined,
      containerType: firstContainer?.container_type ?? undefined,
      bookingNumber: raw.booking_number ?? undefined,
      billOfLadingNumber: raw.mbl_number ?? undefined,
      vesselName: raw.vessel_name ?? undefined,
      voyageNumber: raw.voyage_number ?? undefined,
      shippingLine: raw.shipping_line ?? undefined,
      portOfLoading: raw.port_of_loading ?? undefined,
      portOfDischarge: raw.port_of_discharge ?? undefined,
      estimatedDeparture: toISODate(raw.etd),
      estimatedArrival: toISODate(raw.eta),
      actualDeparture: toISODate(raw.atd),
      actualArrival: toISODate(raw.ata),
      sealNumber: firstContainer?.seal_number ?? undefined,
    },
    reference: raw.hbl_number ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export interface GoFreightMasterBillListResponse {
  results?: GoFreightMasterBill[]
  count?: number
  next?: string | null
  previous?: string | null
  [key: string]: unknown
}
