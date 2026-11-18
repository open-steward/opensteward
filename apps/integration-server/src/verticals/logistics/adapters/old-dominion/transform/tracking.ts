import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface OldDominionTrackingEvent {
  dateTime: string
  status: string
  description: string
  city?: string
  state?: string
  postalCode?: string
  [key: string]: unknown
}

export interface OldDominionTrackingResponse {
  proNumber: string
  status?: string
  statusDescription?: string
  events?: OldDominionTrackingEvent[]
  estimatedDeliveryDate?: string
  deliveredDate?: string
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(evt: OldDominionTrackingEvent): Address | undefined {
  const hasAny = evt.city || evt.state || evt.postalCode
  if (!hasAny) return undefined
  return {
    city: evt.city ?? undefined,
    state: evt.state ?? undefined,
    postalCode: evt.postalCode ?? undefined,
    country: 'US',
  }
}

export function transformTrackingEvents(raw: OldDominionTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.proNumber

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'old-dominion',
    status: mapTrackingStatus(evt.status),
    description: evt.description ?? undefined,
    location: toLocation(evt),
    occurredAt: toISODate(evt.dateTime),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'old-dominion',
      status: mapTrackingStatus(raw.status),
      description: raw.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
