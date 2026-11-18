import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface PitneyBowesTrackingLocation {
  city?: string
  stateProvince?: string
  postalCode?: string
  country?: string
  [key: string]: unknown
}

export interface PitneyBowesScanEvent {
  eventDateTime: string
  eventCode: string
  eventDescription: string
  eventCity?: string
  eventStateProvince?: string
  eventPostalCode?: string
  eventCountry?: string
  [key: string]: unknown
}

export interface PitneyBowesTrackingResponse {
  trackingNumber: string
  packageStatus?: string
  packageStatusDescription?: string
  scanDetailsList?: PitneyBowesScanEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toScanLocation(evt: PitneyBowesScanEvent): Address | undefined {
  const hasAny = evt.eventCity || evt.eventStateProvince || evt.eventPostalCode || evt.eventCountry
  if (!hasAny) return undefined
  return {
    city: evt.eventCity ?? undefined,
    state: evt.eventStateProvince ?? undefined,
    postalCode: evt.eventPostalCode ?? undefined,
    country: evt.eventCountry ?? undefined,
  }
}

export function transformTrackingEvents(raw: PitneyBowesTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber

  const events: TrackingEvent[] = (raw.scanDetailsList ?? []).map((scan) => ({
    trackingNumber,
    carrierId: 'pitney-bowes',
    status: mapTrackingStatus(scan.eventCode),
    description: scan.eventDescription ?? undefined,
    location: toScanLocation(scan),
    occurredAt: toISODate(scan.eventDateTime),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'pitney-bowes',
      status: mapTrackingStatus(raw.packageStatus),
      description: raw.packageStatusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
