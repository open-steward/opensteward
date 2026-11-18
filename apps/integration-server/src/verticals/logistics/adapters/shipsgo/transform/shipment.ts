import type { Shipment, ShipmentStatus, OceanFields } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── Raw ShipsGo API types ────────────────────────────────────────────────────

/**
 * A single milestone event as returned by ShipsGo within a shipment record.
 * ShipsGo returns milestones as an array of status change objects.
 */
export interface ShipsGoMilestone {
  statusCode?: string | null
  status?: string | null
  actualTime?: string | null
  estimatedTime?: string | null
  location?: string | null
  [key: string]: unknown
}

/**
 * A container record as returned by the ShipsGo v2 API.
 * Field names match the documented JSON response structure.
 */
export interface ShipsGoContainer {
  /** ShipsGo internal shipment ID */
  shipmentId?: string | number | null
  /** ISO 6346 container number */
  containerNumber?: string | null
  /** Master Bill of Lading number */
  mblNumber?: string | null
  /** Carrier booking reference */
  bookingNumber?: string | null
  /** Current container status (e.g. "Sailing", "Arrived", "Gate Out") */
  containerStatus?: string | null
  /** Shipping line / carrier name */
  shippingLine?: string | null
  /** SCAC code of the shipping line */
  scac?: string | null
  /** Vessel name */
  vesselName?: string | null
  /** Voyage number */
  voyageNumber?: string | null
  /** Port of loading — city/port name */
  pol?: string | null
  /** Port of loading — UN/LOCODE */
  polCode?: string | null
  /** Port of discharge — city/port name */
  pod?: string | null
  /** Port of discharge — UN/LOCODE */
  podCode?: string | null
  /** Container type/size code (e.g. "40HC", "20GP") */
  containerType?: string | null
  /** Estimated time of departure */
  etd?: string | null
  /** Actual time of departure */
  atd?: string | null
  /** Estimated time of arrival */
  eta?: string | null
  /** Actual time of arrival */
  ata?: string | null
  /** Latitude of vessel/container (when mapPoint=true requested) */
  latitude?: number | null
  /** Longitude of vessel/container (when mapPoint=true requested) */
  longitude?: number | null
  /** Whether the shipment is delayed */
  isDelayed?: boolean | null
  /** Delay in days (negative = early) */
  delayDays?: number | null
  /** CO2 emissions in kg */
  co2Emission?: number | null
  /** Transit time in days */
  transitTime?: number | null
  /** Milestone events */
  milestones?: ShipsGoMilestone[] | null
  /** ISO timestamp when the shipment was created in ShipsGo */
  createdDate?: string | null
  /** ISO timestamp when the record was last updated */
  updatedDate?: string | null
  [key: string]: unknown
}

/**
 * List endpoint response wrapper.
 */
export interface ShipsGoListResponse {
  data?: ShipsGoContainer[] | null
  totalCount?: number | null
  pageIndex?: number | null
  pageSize?: number | null
  [key: string]: unknown
}

// ─── Status mapping ───────────────────────────────────────────────────────────

/**
 * Maps a ShipsGo `containerStatus` string to a canonical ShipmentStatus.
 * ShipsGo milestones (in order): Booked → Loaded → Sailing → Arrived →
 *   Discharged → Not Released → Gate Out.
 */
export function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('gate out') || s.includes('gateout') || s.includes('delivered')) return 'DELIVERED'
  if (s.includes('discharged') || s.includes('not released')) return 'OUT_FOR_DELIVERY'
  if (s.includes('arrived')) return 'IN_TRANSIT'
  if (s.includes('sailing') || s.includes('loaded') || s.includes('in transit')) return 'IN_TRANSIT'
  if (s.includes('booked') || s.includes('created') || s.includes('registered')) return 'LABEL_CREATED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('exception') || s.includes('fail')) return 'EXCEPTION'
  return 'UNKNOWN'
}

// ─── Transform ────────────────────────────────────────────────────────────────

export function transformShipment(raw: ShipsGoContainer): Shipment {
  const id = raw.shipmentId != null ? String(raw.shipmentId) : (raw.containerNumber ?? undefined)
  const trackingNumber = raw.containerNumber ?? raw.mblNumber ?? undefined

  const ocean: OceanFields = {
    containerNumber: raw.containerNumber ?? undefined,
    containerType: raw.containerType ?? undefined,
    bookingNumber: raw.bookingNumber ?? undefined,
    billOfLadingNumber: raw.mblNumber ?? undefined,
    vesselName: raw.vesselName ?? undefined,
    voyageNumber: raw.voyageNumber ?? undefined,
    shippingLine: raw.shippingLine ?? undefined,
    portOfLoading: raw.polCode ?? raw.pol ?? undefined,
    portOfDischarge: raw.podCode ?? raw.pod ?? undefined,
    estimatedDeparture: toISODate(raw.etd),
    estimatedArrival: toISODate(raw.eta),
    actualDeparture: toISODate(raw.atd),
    actualArrival: toISODate(raw.ata),
  }

  const originAddress =
    raw.pol != null
      ? { city: raw.pol ?? undefined, postalCode: raw.polCode ?? undefined }
      : undefined

  const destinationAddress =
    raw.pod != null
      ? { city: raw.pod ?? undefined, postalCode: raw.podCode ?? undefined }
      : undefined

  return {
    id,
    status: mapShipmentStatus(raw.containerStatus),
    trackingNumber,
    carrierId: raw.scac ?? raw.shippingLine ?? 'shipsgo',
    serviceCode: undefined,
    originAddress,
    destinationAddress,
    estimatedDeliveryAt: toISODate(raw.eta),
    actualDeliveryAt: toISODate(raw.ata),
    reference: raw.mblNumber ?? raw.bookingNumber ?? undefined,
    mode: 'ocean',
    ocean,
    createdAt: toISODate(raw.createdDate),
    updatedAt: toISODate(raw.updatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
