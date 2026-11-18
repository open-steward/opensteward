import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/** A single scan/checkpoint entry from ClickPost tracking response */
export interface ClickPostScan {
  status: string | null
  status_code: number | null
  location: string | null
  timestamp: string | null
  clickpost_status_code: number | null
  clickpost_status_description: string | null
  remark: string | null
  [key: string]: unknown
}

/** ClickPost tracking response for a single waybill */
export interface ClickPostTrackingResult {
  waybill: string
  cp_id: number | null
  clickpost_status_code: number | null
  clickpost_status_description: string | null
  latest_status: string | null
  scans: ClickPostScan[]
  edd: string | null
  order_id: string | null
  reference_number: string | null
  is_rvp: boolean | null
  [key: string]: unknown
}

/**
 * Map ClickPost numeric status codes to canonical TrackingEventStatus.
 * Reference: https://docs.clickpost.ai/docs/tracking-status-codes
 */
function mapStatusCode(code: number | null): TrackingEventStatus {
  if (code === null) return 'UNKNOWN'
  // ClickPost status code ranges:
  // 1-9:   Pre-transit / info received
  // 10-49: In transit
  // 50-59: Out for delivery
  // 60:    Delivered
  // 70-79: Exception / failed delivery
  // 80-89: RTO (return to origin)
  // 90+:   Other
  if (code >= 1 && code <= 9) return 'PRE_TRANSIT'
  if (code >= 10 && code <= 49) return 'IN_TRANSIT'
  if (code >= 50 && code <= 59) return 'OUT_FOR_DELIVERY'
  if (code === 60) return 'DELIVERED'
  if (code >= 70 && code <= 79) return 'FAILURE'
  if (code >= 80 && code <= 89) return 'RETURN_TO_SENDER'
  return 'UNKNOWN'
}

/**
 * Parse a location string (e.g. "Mumbai, MH, IN") into an Address.
 * Returns undefined when the string is empty or null.
 */
function parseLocation(location: string | null | undefined): Address | undefined {
  if (!location) return undefined
  const parts = location.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return undefined
  // Best-effort: city[, state[, country]]
  return {
    city: parts[0] ?? undefined,
    state: parts[1] ?? undefined,
    country: parts[2] ?? undefined,
  }
}

/**
 * Convert a ClickPost tracking response into an array of canonical TrackingEvents.
 * One event is emitted per scan entry; a fallback summary event is emitted when
 * the scan array is empty.
 */
export function transformTrackingResult(raw: ClickPostTrackingResult): TrackingEvent[] {
  const scans = raw.scans ?? []

  const events: TrackingEvent[] = scans.map((scan) => ({
    trackingNumber: raw.waybill ?? undefined,
    carrierId: raw.cp_id != null ? String(raw.cp_id) : undefined,
    status: mapStatusCode(scan.clickpost_status_code ?? null),
    description: scan.clickpost_status_description ?? scan.remark ?? scan.status ?? undefined,
    location: parseLocation(scan.location),
    occurredAt: toISODate(scan.timestamp),
    createdAt: toISODate(scan.timestamp),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.waybill ?? undefined,
      carrierId: raw.cp_id != null ? String(raw.cp_id) : undefined,
      status: mapStatusCode(raw.clickpost_status_code ?? null),
      description: raw.clickpost_status_description ?? raw.latest_status ?? undefined,
      createdAt: undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
