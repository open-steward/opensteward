import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * Individual tracking checkpoint within a Chazki tracking response.
 *
 * The `status` field contains the official Chazki lifecycle status string
 * (e.g. "GOTO_DELIVER", "DELIVERED") or the `delivery_status` from webhook
 * payloads (e.g. "DELIVERED").
 */
export interface ChazkiTrackingEvent {
  status?: string | null
  /** Status description or human-readable message. */
  description?: string | null
  message?: string | null
  location?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  occurred_at?: string | null
  datetime?: string | null
  timestamp?: string | null
  [key: string]: unknown
}

/**
 * Chazki tracking response — returned by GET /tracking/select/delivery-code.
 *
 * The top-level `status` and `delivery_status` hold the latest state.
 * `history` / `events` / `tracking_events` contain the full audit trail.
 */
export interface ChazkiTrackingResponse {
  id?: string | null
  tracking_number?: string | null
  tracking_code?: string | null
  /** Primary delivery code used by Chazki (from nintendo API). */
  code?: string | null
  delivery_code?: string | null
  status?: string | null
  delivery_status?: string | null
  carrier?: string | null
  shipment_id?: string | null
  events?: ChazkiTrackingEvent[]
  tracking_events?: ChazkiTrackingEvent[]
  history?: ChazkiTrackingEvent[]
  /** ISO-8601 creation timestamp. */
  created_at?: string | null
  /** Tracking URL provided by Chazki in webhook payloads. */
  url_delivery_code?: string | null
  [key: string]: unknown
}

/**
 * Map Chazki status strings to canonical TrackingEventStatus values.
 *
 * Official lifecycle (nintendo.yaml):
 *   NEW → PICKUP → GOTO_PICK → ARRIVED_PICK → PICKING → FAILED_PICK →
 *   COLLECTED → GOTO_DELIVER → ARRIVED_DELIVER → DELIVERED →
 *   FAILED_DROP → RETURNED → CANCELED
 *
 * Webhook payload delivers `delivery_status` which matches the same enum.
 */
function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toUpperCase()) {
    // Pre-transit states
    case 'NEW':
    case 'PRE_TRANSITO':
    case 'PRE_TRANSIT':
    case 'CREADO':
    case 'PENDIENTE':
      return 'PRE_TRANSIT'

    // In-transit states
    case 'PICKUP':
    case 'GOTO_PICK':
    case 'ARRIVED_PICK':
    case 'PICKING':
    case 'COLLECTED':
    case 'GOTO_DELIVER':
    case 'RECOGIDO':
    case 'EN_BODEGA':
    case 'EN_TRANSITO':
    case 'EN_CAMINO':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'

    // Out for delivery
    case 'ARRIVED_DELIVER':
    case 'EN_REPARTO':
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'

    // Delivered
    case 'DELIVERED':
    case 'ENTREGADO':
      return 'DELIVERED'

    // Available for pickup at facility
    case 'DISPONIBLE_PARA_RECOJO':
    case 'AVAILABLE_FOR_PICKUP':
      return 'AVAILABLE_FOR_PICKUP'

    // Returned to sender
    case 'RETURNED':
    case 'DEVUELTO':
    case 'RETURN_TO_SENDER':
      return 'RETURN_TO_SENDER'

    // Failure / exception
    case 'FAILED_PICK':
    case 'FAILED_DROP':
    case 'EXCEPCION':
    case 'FALLIDO':
    case 'FAILED':
    case 'FAILURE':
      return 'FAILURE'

    default:
      return 'UNKNOWN'
  }
}

function toEventLocation(ev: ChazkiTrackingEvent): Address | undefined {
  const city = ev.city ?? (typeof ev.location === 'string' ? ev.location : undefined)
  const state = ev.state ?? undefined
  const country = ev.country ?? undefined
  if (!city && !state && !country) return undefined
  return { city: city ?? undefined, state, country }
}

export function transformTracking(raw: ChazkiTrackingResponse): TrackingEvent[] {
  const trackingNumber =
    raw.tracking_number ?? raw.tracking_code ?? raw.code ?? raw.delivery_code ?? undefined
  const topStatus = raw.status ?? raw.delivery_status ?? undefined
  const events = raw.events ?? raw.tracking_events ?? raw.history ?? []

  const mapped: TrackingEvent[] = events.map((ev) => ({
    shipmentId: raw.shipment_id ?? raw.id ?? undefined,
    trackingNumber,
    carrierId: raw.carrier ?? 'chazki',
    status: mapTrackingStatus(ev.status ?? topStatus),
    description: ev.description ?? ev.message ?? undefined,
    location: toEventLocation(ev),
    occurredAt: toISODate(ev.occurred_at ?? ev.datetime ?? ev.timestamp),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }))

  // If no detail events, emit a single summary event from the top-level status.
  if (mapped.length === 0) {
    mapped.push({
      shipmentId: raw.shipment_id ?? raw.id ?? undefined,
      trackingNumber,
      carrierId: raw.carrier ?? 'chazki',
      status: mapTrackingStatus(topStatus),
      createdAt: toISODate(raw.created_at),
      metadata: raw as Record<string, unknown>,
    })
  }

  return mapped
}
