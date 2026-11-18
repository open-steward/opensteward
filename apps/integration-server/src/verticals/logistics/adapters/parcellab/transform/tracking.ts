import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ── Raw parcelLab types ──────────────────────────────────────────────────────

export interface ParcellabCheckpoint {
  /** parcelLab lifecycle status */
  status?: string
  /** Human-readable status text */
  status_text?: string | null
  /** Detailed description */
  status_details?: string | null
  /** Courier-native status code */
  courier_status?: string | null
  /** Event timestamp (ISO-8601) */
  timestamp?: string | null
  /** Event location */
  location?: string | null
  city?: string | null
  zip?: string | null
  country?: string | null
  /** Exception flag */
  exception?: boolean | null
  [key: string]: unknown
}

export interface ParcellabTracking {
  /** Carrier tracking number */
  tracking_number?: string | null
  /** Courier/carrier identifier */
  courier?: string | null
  /** Order number */
  orderNo?: string | null
  /** External/platform ID */
  external_id?: string | null
  /** Current lifecycle status */
  last_delivery_status?: {
    status_code?: string | null
    status_text?: string | null
    status_details?: string | null
  } | null
  /** Checkpoints/events */
  checkpoints?: ParcellabCheckpoint[]
  /** Recipient postal code */
  zip_code?: string | null
  /** Destination city */
  city?: string | null
  /** Destination country (ISO 3166-1 alpha-3) */
  destination_country_iso3?: string | null
  /** Announced delivery date */
  announced_delivery_date?: string | null
  /** Created timestamp */
  created_at?: string | null
  /** Updated timestamp */
  updated_at?: string | null
  [key: string]: unknown
}

// ── Status mapping ───────────────────────────────────────────────────────────

/**
 * Map parcelLab lifecycle status codes to canonical TrackingEventStatus.
 * Based on the LifecycleStatusEnum: Pending, Transit, Customs, LastMile,
 * ReadyToCollect, Delivered, SentBack, Returned, Failed, Cancelled.
 */
function mapLifecycleStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s === 'pending') return 'PRE_TRANSIT'
  if (s === 'transit' || s === 'customs') return 'IN_TRANSIT'
  if (s === 'lastmile') return 'OUT_FOR_DELIVERY'
  if (s === 'readytocollect') return 'AVAILABLE_FOR_PICKUP'
  if (s === 'delivered') return 'DELIVERED'
  if (s === 'sentback' || s === 'returned') return 'RETURN_TO_SENDER'
  if (s === 'failed' || s === 'cancelled') return 'FAILURE'
  return 'UNKNOWN'
}

// ── Location helper ───────────────────────────────────────────────────────────

function toCheckpointLocation(cp: ParcellabCheckpoint): Address | undefined {
  const hasAny = cp.city || cp.zip || cp.country || cp.location
  if (!hasAny) return undefined
  return {
    city: cp.city ?? undefined,
    postalCode: cp.zip ?? undefined,
    country: cp.country ?? undefined,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTracking(raw: ParcellabTracking): TrackingEvent[] {
  const checkpoints = raw.checkpoints ?? []

  // One TrackingEvent per checkpoint
  const events: TrackingEvent[] = checkpoints.map((cp) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.courier ?? undefined,
    status: mapLifecycleStatus(cp.status),
    description: cp.status_details ?? cp.status_text ?? undefined,
    location: toCheckpointLocation(cp),
    occurredAt: toISODate(cp.timestamp),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }))

  // If no checkpoints, synthesise a single summary event from the tracking header
  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: raw.courier ?? undefined,
      status: mapLifecycleStatus(raw.last_delivery_status?.status_code),
      description:
        raw.last_delivery_status?.status_details ??
        raw.last_delivery_status?.status_text ??
        undefined,
      createdAt: toISODate(raw.created_at),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
