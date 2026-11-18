import { toIsoDatetime } from '@opensteward/shared'
import type { Shipment, ShipmentStatus, OceanFields } from '../../../schema/shipment'

// ─── Raw API types ────────────────────────────────────────────────────────────

export interface SinayLocation {
  name?: string | null
  country?: string | null
  locode?: string | null
  coordinates?: { lat?: number | null; lng?: number | null } | null
  [key: string]: unknown
}

export interface SinayRoutePort {
  name?: string | null
  locode?: string | null
  country?: string | null
  date?: string | null
  actual?: boolean | null
  predictiveEta?: string | null
  [key: string]: unknown
}

export interface SinayVessel {
  name?: string | null
  imo?: string | null
  callSign?: string | null
  mmsi?: string | null
  flag?: string | null
  [key: string]: unknown
}

export interface SinayContainerEvent {
  location?: SinayLocation | null
  description?: string | null
  eventType?: string | null
  eventCode?: string | null
  status?: string | null
  date?: string | null
  isActual?: boolean | null
  vessel?: SinayVessel | null
  voyage?: string | null
  [key: string]: unknown
}

export interface SinayContainer {
  number?: string | null
  isoCode?: string | null
  sizeType?: string | null
  status?: string | null
  events?: SinayContainerEvent[]
  [key: string]: unknown
}

/**
 * Response shape returned by GET /shipment
 * (container-tracking/api/v2/shipment?shipmentNumber=…)
 */
export interface SinayShipmentResponse {
  shipmentType?: string | null
  shipmentNumber?: string | null
  sealine?: string | null
  sealineName?: string | null
  shippingStatus?: string | null
  updatedAt?: string | null
  containers?: SinayContainer[]
  /** Route waypoints: prepol → pol → (transshipments) → pod → postpod */
  route?: {
    prepol?: SinayRoutePort | null
    pol?: SinayRoutePort | null
    pod?: SinayRoutePort | null
    postpod?: SinayRoutePort | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

// ─── Search result (POST /public/shipments/search) ───────────────────────────

export interface SinaySearchShipmentResult {
  id?: string | null
  shipmentNumber?: string | null
  sealine?: string | null
  sealineName?: string | null
  link?: string | null
  [key: string]: unknown
}

export interface SinaySearchResponse {
  results?: SinaySearchShipmentResult[]
  notFoundResults?: string[]
  [key: string]: unknown
}

// ─── Status mapping ───────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s === 'DELIVERED') return 'DELIVERED'
  if (s === 'IN_TRANSIT' || s === 'IN-TRANSIT' || s.includes('TRANSIT')) return 'IN_TRANSIT'
  if (s === 'PLANNED' || s.includes('PLAN') || s.includes('BOOK')) return 'LABEL_CREATED'
  if (s === 'UNKNOWN') return 'UNKNOWN'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('EXCEPTION') || s.includes('ERROR')) return 'EXCEPTION'
  return 'UNKNOWN'
}

// ─── Transforms ──────────────────────────────────────────────────────────────

/**
 * Transform a full GET /shipment response into a canonical Shipment.
 * Uses the first container when the shipment carries multiple containers.
 */
export function transformShipment(raw: SinayShipmentResponse): Shipment {
  const firstContainer = raw.containers?.[0]
  const route = raw.route ?? null

  const pol = route?.pol ?? null
  const pod = route?.pod ?? null

  // Prefer actual date, fall back to predictive ETA
  const etaStr = pod?.date ?? pod?.predictiveEta ?? undefined

  const ocean: OceanFields = {
    containerNumber: firstContainer?.number ?? raw.shipmentNumber ?? undefined,
    containerType: firstContainer?.sizeType ?? firstContainer?.isoCode ?? undefined,
    shippingLine: raw.sealineName ?? raw.sealine ?? undefined,
    portOfLoading: pol?.locode ?? pol?.name ?? undefined,
    portOfDischarge: pod?.locode ?? pod?.name ?? undefined,
    estimatedArrival: toIsoDatetime(etaStr) ? new Date(toIsoDatetime(etaStr)!) : undefined,
    actualArrival: pod?.actual ? (toIsoDatetime(pod.date) ? new Date(toIsoDatetime(pod.date)!) : undefined) : undefined,
    estimatedDeparture: toIsoDatetime(pol?.date) ? new Date(toIsoDatetime(pol?.date)!) : undefined,
    actualDeparture: pol?.actual ? (toIsoDatetime(pol.date) ? new Date(toIsoDatetime(pol.date)!) : undefined) : undefined,
  }

  return {
    id: raw.shipmentNumber ?? firstContainer?.number ?? undefined,
    status: mapShipmentStatus(raw.shippingStatus ?? firstContainer?.status),
    trackingNumber: raw.shipmentNumber ?? firstContainer?.number ?? undefined,
    carrierId: 'sinay',
    estimatedDeliveryAt: toIsoDatetime(etaStr) ? new Date(toIsoDatetime(etaStr)!) : undefined,
    updatedAt: toIsoDatetime(raw.updatedAt) ? new Date(toIsoDatetime(raw.updatedAt)!) : undefined,
    mode: 'ocean',
    ocean,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a search-result row (POST /public/shipments/search) into a
 * lightweight canonical Shipment.  Full detail requires a subsequent
 * GET /shipment call; we surface what we have.
 */
export function transformSearchResult(raw: SinaySearchShipmentResult): Shipment {
  return {
    id: raw.id ?? raw.shipmentNumber ?? undefined,
    trackingNumber: raw.shipmentNumber ?? undefined,
    carrierId: 'sinay',
    mode: 'ocean',
    ocean: {
      shippingLine: raw.sealineName ?? raw.sealine ?? undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
