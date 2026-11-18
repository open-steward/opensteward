import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Canada Post raw types ──────────────────────────────────────────────────

export interface CanadaPostOccurrence {
  'event-identifier': string
  'event-date': string | null
  'event-time': string | null
  'event-description': string | null
  'event-site': string | null
  'event-province': string | null
  'event-retail-name': string | null
  [key: string]: unknown
}

export interface CanadaPostTrackingResponse {
  'tracking-detail': {
    pin: string
    'original-pin'?: string | null
    'active-exists'?: string | null
    'mailed-by-customer-number'?: string | null
    'destination-postal-id'?: string | null
    'service-name'?: string | null
    'expected-delivery-date'?: string | null
    'actual-delivery-date'?: string | null
    'delivery-options'?: Record<string, unknown> | null
    'significant-events'?: { occurrence: CanadaPostOccurrence[] } | null
    [key: string]: unknown
  }
}

// ─── Status mapping ─────────────────────────────────────────────────────────

/**
 * Canada Post tracking uses numeric event identifiers. We map the most common
 * ones, falling back to UNKNOWN when an identifier is not recognised.
 */
function mapTrackingStatus(eventIdentifier: string): TrackingEventStatus {
  switch (eventIdentifier) {
    case '20':
    case '100':
    case '1000':                return 'PRE_TRANSIT'
    case '500':
    case '600':
    case '700':                 return 'IN_TRANSIT'
    case '1496':
    case '1497':                return 'OUT_FOR_DELIVERY'
    case '1408':
    case '1409':
    case '1410':                return 'DELIVERED'
    case '1441':
    case '1442':                return 'AVAILABLE_FOR_PICKUP'
    case '1700':
    case '1701':                return 'RETURN_TO_SENDER'
    case '1800':
    case '1801':
    case '1802':                return 'FAILURE'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: CanadaPostTrackingResponse): TrackingEvent[] {
  const detail = raw['tracking-detail']
  if (!detail) return []

  const occurrences = detail['significant-events']?.occurrence ?? []
  const pin = detail.pin

  if (occurrences.length === 0) {
    return [
      {
        trackingNumber: pin ?? undefined,
        carrierId: 'canada-post',
        status: 'UNKNOWN',
        metadata: detail as Record<string, unknown>,
      },
    ]
  }

  return occurrences.map((occ) => {
    const iso =
      occ['event-date'] && occ['event-time']
        ? `${occ['event-date']}T${occ['event-time']}`
        : occ['event-date'] ?? undefined
    return {
      trackingNumber: pin ?? undefined,
      carrierId: 'canada-post',
      status: mapTrackingStatus(occ['event-identifier']),
      description: occ['event-description'] ?? undefined,
      location: occ['event-site']
        ? {
            city: occ['event-site'] ?? undefined,
            state: occ['event-province'] ?? undefined,
            country: 'CA',
          }
        : undefined,
      occurredAt: toISODate(iso),
      metadata: occ as Record<string, unknown>,
    }
  })
}
