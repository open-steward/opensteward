import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── Raw API types ──────────────────────────────────────────────────────────

export interface SeaVantageMilestone {
  event?: string | null
  actual_time?: string | null
  estimated_time?: string | null
  location?: string | null
  description?: string | null
  [key: string]: unknown
}

export interface SeaVantageCargoResponse {
  shipment_id?: string | null
  type?: string | null
  carrier?: string | null
  vessel?: string | null
  voyage_number?: string | null
  container_number?: string | null
  container_type?: string | null
  booking_number?: string | null
  mbl_number?: string | null
  loading_port?: string | null
  discharging_port?: string | null
  /** Estimated time of departure (ISO-8601) */
  etd?: string | null
  /** Actual time of departure (ISO-8601) */
  atd?: string | null
  /** ETA from carrier schedule (ISO-8601) */
  eta_carrier?: string | null
  /** SeaVantage AI-predicted time of arrival (ISO-8601) */
  pta_seavantage?: string | null
  /** Actual time of arrival (ISO-8601) */
  ata?: string | null
  status?: string | null
  milestones?: SeaVantageMilestone[]
  [key: string]: unknown
}

export interface SeaVantageCargoListResponse {
  code?: number | null
  message?: string | null
  error?: boolean | null
  timestamp?: string | null
  response?: SeaVantageCargoResponse[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

export function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('DELIVERED') || s.includes('DISCHARGED')) return 'DELIVERED'
  if (s.includes('OUT_FOR_DELIVERY') || s.includes('GATE_OUT')) return 'OUT_FOR_DELIVERY'
  if (s.includes('IN_TRANSIT') || s.includes('DEPARTED') || s.includes('ON_VESSEL')) return 'IN_TRANSIT'
  if (s.includes('LABEL') || s.includes('BOOKED') || s.includes('GATE_IN')) return 'LABEL_CREATED'
  if (s.includes('EXCEPTION') || s.includes('ERROR')) return 'EXCEPTION'
  if (s.includes('RETURNED')) return 'RETURNED'
  if (s.includes('PENDING')) return 'PENDING'
  return 'UNKNOWN'
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: SeaVantageCargoResponse): Shipment {
  return {
    id: raw.shipment_id ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.container_number ?? raw.mbl_number ?? raw.booking_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    mode: 'ocean',
    reference: raw.booking_number ?? undefined,
    estimatedDeliveryAt: toISODate(raw.pta_seavantage ?? raw.eta_carrier),
    actualDeliveryAt: toISODate(raw.ata),
    ocean: {
      containerNumber: raw.container_number ?? undefined,
      containerType: raw.container_type ?? undefined,
      bookingNumber: raw.booking_number ?? undefined,
      billOfLadingNumber: raw.mbl_number ?? undefined,
      vesselName: raw.vessel ?? undefined,
      voyageNumber: raw.voyage_number ?? undefined,
      shippingLine: raw.carrier ?? undefined,
      portOfLoading: raw.loading_port ?? undefined,
      portOfDischarge: raw.discharging_port ?? undefined,
      estimatedDeparture: toISODate(raw.etd),
      estimatedArrival: toISODate(raw.eta_carrier),
      actualDeparture: toISODate(raw.atd),
      actualArrival: toISODate(raw.ata),
    },
    metadata: raw as Record<string, unknown>,
  }
}
