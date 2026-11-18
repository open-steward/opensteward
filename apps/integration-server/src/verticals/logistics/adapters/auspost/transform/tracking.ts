import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface AusPostTrackingLocation {
  description?: string
  suburb?: string
  state?: string
  postcode?: string
  country?: string
  [key: string]: unknown
}

export interface AusPostScanEvent {
  date: string
  description: string
  status: string
  location?: AusPostTrackingLocation
  [key: string]: unknown
}

export interface AusPostTrackingResult {
  tracking_id: string
  status?: string
  trackable_items?: Array<{
    article_id: string
    events?: AusPostScanEvent[]
    status?: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface AusPostTrackingResponse {
  tracking_results: AusPostTrackingResult[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: AusPostTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.suburb || loc.state || loc.postcode || loc.country
  if (!hasAny) return undefined
  return {
    city: loc.suburb ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.postcode ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: AusPostTrackingResult): TrackingEvent[] {
  const trackingNumber = raw.tracking_id
  const items = raw.trackable_items ?? []

  const events: TrackingEvent[] = items.flatMap((item) =>
    (item.events ?? []).map((evt) => ({
      trackingNumber,
      carrierId: 'auspost',
      status: mapTrackingStatus(evt.status),
      description: evt.description ?? undefined,
      location: toLocation(evt.location),
      occurredAt: toISODate(evt.date),
      metadata: raw as Record<string, unknown>,
    })),
  )

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'auspost',
      status: mapTrackingStatus(raw.status),
      description: undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
