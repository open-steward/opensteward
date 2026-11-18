import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface FedExScanLocation {
  city?: string
  stateOrProvinceCode?: string
  countryCode?: string
  postalCode?: string
}

export interface FedExScanEvent {
  date: string
  eventType: string
  eventDescription: string
  scanLocation?: FedExScanLocation
}

export interface FedExDateAndTime {
  type: string
  dateTime: string
}

export interface FedExTrackResult {
  trackingNumberInfo: {
    trackingNumber: string
  }
  latestStatusDetail?: {
    code?: string
    description?: string
  }
  scanEvents?: FedExScanEvent[]
  dateAndTimes?: FedExDateAndTime[]
  [key: string]: unknown
}

export interface FedExTrackResponse {
  output: {
    completeTrackResults: Array<{
      trackResults: FedExTrackResult[]
    }>
  }
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toScanLocation(loc: FedExScanLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.stateOrProvinceCode || loc.countryCode || loc.postalCode
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.stateOrProvinceCode ?? undefined,
    country: loc.countryCode ?? undefined,
    postalCode: loc.postalCode ?? undefined,
  }
}

export function transformTrackResult(raw: FedExTrackResult): TrackingEvent[] {
  const trackingNumber = raw.trackingNumberInfo?.trackingNumber

  const events: TrackingEvent[] = (raw.scanEvents ?? []).map((scan) => ({
    trackingNumber,
    carrierId: 'fedex',
    status: mapTrackingStatus(scan.eventType),
    description: scan.eventDescription ?? undefined,
    location: toScanLocation(scan.scanLocation),
    occurredAt: toISODate(scan.date),
    metadata: raw as Record<string, unknown>,
  }))

  // If no scan events, emit a single summary event from latestStatusDetail
  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'fedex',
      status: mapTrackingStatus(raw.latestStatusDetail?.code),
      description: raw.latestStatusDetail?.description ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
