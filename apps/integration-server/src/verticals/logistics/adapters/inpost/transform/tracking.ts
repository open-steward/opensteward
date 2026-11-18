/**
 * ShipX Tracking → canonical TrackingEvents.
 *
 * GET /v1/tracking/:tracking_number returns `tracking_number`, `status`
 * ("Current shipment status."), and `tracking_details`: "An array containing
 * the history of shipment status changes in chronological descending order."
 * Each entry has `status` ("Status name"), `origin_status` ("Status symbol"),
 * `agency` and `datetime` ("Time of change")
 * (https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153479/).
 *
 * One event per `tracking_details` entry. The current `status` is not an
 * event history, so a shipment with no details yields no events.
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'
import { INPOST_CARRIER_ID } from './carrier'

export interface InPostTrackingDetail {
  status: string
  origin_status?: string | null
  agency?: string | null
  datetime: string
}

export interface InPostTrackingResponse {
  tracking_number: string
  service?: string
  type?: string
  status?: string
  tracking_details?: InPostTrackingDetail[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapTrackingStatus(name: string): TrackingEventStatus {
  return (TRACKING_STATUS_MAP[name] as TrackingEventStatus | undefined) ?? 'UNKNOWN'
}

export function transformTrackingEvents(raw: InPostTrackingResponse): TrackingEvent[] {
  return (raw.tracking_details ?? []).map((d) => ({
    id: `${raw.tracking_number}:${d.datetime}:${d.status}`,
    trackingNumber: raw.tracking_number,
    carrierId: INPOST_CARRIER_ID,
    status: mapTrackingStatus(d.status),
    occurredAt: toISODate(d.datetime),
    metadata: d as unknown as Record<string, unknown>,
  }))
}
