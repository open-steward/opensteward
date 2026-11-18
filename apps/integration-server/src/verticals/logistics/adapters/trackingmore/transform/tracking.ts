import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

/**
 * A single checkpoint event in a TrackingMore tracking response.
 * Reference: https://www.trackingmore.com/docs/trackingmore/
 */
export interface TrackingMoreCheckpoint {
  checkpoint_time?: string | null
  tracking_detail?: string | null
  location?: string | null
  country_iso2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  message?: string | null
  [key: string]: unknown
}

/**
 * A TrackingMore tracking object returned by GET /trackings/get or
 * POST /trackings/create.
 */
export interface TrackingMoreTracking {
  id?: string | null
  tracking_number?: string | null
  courier_code?: string | null
  order_number?: string | null
  customer_name?: string | null
  title?: string | null
  status?: string | null
  substatus?: string | null
  original_country?: string | null
  destination_country?: string | null
  origin_info?: TrackingMoreOriginInfo | null
  destination_info?: TrackingMoreDestinationInfo | null
  transit_time?: number | null
  latest_checkpoint_time?: string | null
  latest_event?: string | null
  created_at?: string | null
  updated_at?: string | null
  tracking_link?: string | null
  signed_by?: string | null
  note?: string | null
  [key: string]: unknown
}

export interface TrackingMoreOriginInfo {
  courier_code?: string | null
  trackinfo?: TrackingMoreCheckpoint[] | null
  weblink?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface TrackingMoreDestinationInfo {
  courier_code?: string | null
  trackinfo?: TrackingMoreCheckpoint[] | null
  weblink?: string | null
  phone?: string | null
  [key: string]: unknown
}

// ── Status mappers ────────────────────────────────────────────────────────────

/**
 * Map TrackingMore status strings to canonical TrackingEventStatus.
 * TrackingMore statuses: notfound, pending, notyet, transit, pickup, undelivered,
 * delivered, expired, exception
 *
 * Reference: https://www.trackingmore.com/docs/trackingmore/ (Logistics Status section)
 */
function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch (status?.toLowerCase()) {
    case 'pending':
    case 'notyet':
    case 'notfound':
      return 'PRE_TRANSIT'
    case 'transit':
    case 'infoimported':
      return 'IN_TRANSIT'
    case 'pickup':
      return 'AVAILABLE_FOR_PICKUP'
    case 'undelivered':
      return 'FAILURE'
    case 'delivered':
      return 'DELIVERED'
    case 'exception':
      return 'FAILURE'
    case 'expired':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

/**
 * Map TrackingMore status strings to canonical ShipmentStatus.
 */
function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status?.toLowerCase()) {
    case 'pending':
    case 'notyet':
    case 'notfound':
    case 'infoimported':
      return 'LABEL_CREATED'
    case 'transit':
      return 'IN_TRANSIT'
    case 'pickup':
      return 'OUT_FOR_DELIVERY'
    case 'undelivered':
      return 'EXCEPTION'
    case 'delivered':
      return 'DELIVERED'
    case 'exception':
      return 'EXCEPTION'
    case 'expired':
      return 'RETURNED'
    default:
      return 'UNKNOWN'
  }
}

// ── Address helpers ───────────────────────────────────────────────────────────

function checkpointToAddress(cp: TrackingMoreCheckpoint): Address | undefined {
  const hasAny = cp.city || cp.state || cp.zip || cp.country_iso2 || cp.location
  if (!hasAny) return undefined
  return {
    city: cp.city ?? undefined,
    state: cp.state ?? undefined,
    postalCode: cp.zip ?? undefined,
    country: cp.country_iso2 ?? undefined,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

/**
 * Transform a TrackingMore tracking object into a list of canonical TrackingEvents.
 * Emits one event per checkpoint; falls back to a single summary event if
 * no checkpoints are present.
 */
export function transformTracking(raw: TrackingMoreTracking): TrackingEvent[] {
  const trackingNumber = raw.tracking_number ?? undefined
  const carrierId = raw.courier_code ?? undefined

  // Collect checkpoints from both origin and destination info arrays
  const originEvents: TrackingMoreCheckpoint[] = raw.origin_info?.trackinfo ?? []
  const destEvents: TrackingMoreCheckpoint[] = raw.destination_info?.trackinfo ?? []
  const allCheckpoints: TrackingMoreCheckpoint[] = [...originEvents, ...destEvents]

  if (allCheckpoints.length > 0) {
    return allCheckpoints.map((cp) => ({
      trackingNumber,
      carrierId,
      status: mapTrackingStatus(raw.status),
      description: cp.tracking_detail ?? cp.message ?? undefined,
      location: checkpointToAddress(cp),
      occurredAt: toISODate(cp.checkpoint_time),
      createdAt: toISODate(raw.created_at),
      metadata: raw as Record<string, unknown>,
    }))
  }

  // Fallback: single summary event from top-level fields
  return [
    {
      trackingNumber,
      carrierId,
      status: mapTrackingStatus(raw.status),
      description: raw.latest_event ?? undefined,
      occurredAt: toISODate(raw.latest_checkpoint_time),
      createdAt: toISODate(raw.created_at),
      metadata: raw as Record<string, unknown>,
    },
  ]
}

/**
 * Transform a TrackingMore tracking object into a canonical Shipment.
 */
export function transformShipment(raw: TrackingMoreTracking): Shipment {
  return {
    id: raw.id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    status: mapShipmentStatus(raw.status),
    carrierId: raw.courier_code ?? undefined,
    reference: raw.order_number ?? undefined,
    notes: raw.note ?? undefined,
    originAddress: raw.original_country
      ? { country: raw.original_country ?? undefined }
      : undefined,
    destinationAddress: raw.destination_country
      ? { country: raw.destination_country ?? undefined }
      : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
