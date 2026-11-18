import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate, toAddress } from '../../shared/transform'

export interface ShiprocketTrackingActivity {
  date: string | null
  status: string | null
  activity: string | null
  location: string | null
  sr_status: string | null
  [key: string]: unknown
}

export interface ShiprocketTrackingData {
  tracking_data: {
    track_status: number | null
    shipment_status: number | null
    shipment_track: Array<{
      id: number | null
      shipment_id: number | null
      awb_code: string | null
      courier_company_id: number | null
      courier_name: string | null
      current_status: string | null
      [key: string]: unknown
    }> | null
    shipment_track_activities: ShiprocketTrackingActivity[] | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null): TrackingEventStatus {
  switch (status) {
    case 'pickup_scheduled':  return 'PRE_TRANSIT'
    case 'picked_up':         return 'PRE_TRANSIT'
    case 'in_transit':        return 'IN_TRANSIT'
    case 'out_for_delivery':  return 'OUT_FOR_DELIVERY'
    case 'delivered':         return 'DELIVERED'
    case 'rto_initiated':     return 'RETURN_TO_SENDER'
    case 'rto_delivered':     return 'RETURN_TO_SENDER'
    case 'lost':              return 'FAILURE'
    default:                  return 'UNKNOWN'
  }
}

export function transformTracking(
  raw: ShiprocketTrackingData,
  trackingNumber: string,
): TrackingEvent[] {
  const trackData = raw.tracking_data
  const activities = trackData?.shipment_track_activities ?? []
  const trackInfo = (trackData?.shipment_track ?? [])[0]
  // The real shipment id lives on shipment_track[0].shipment_id — the route
  // argument is an AWB/tracking number, not a shipment id, and must not be
  // reused as one.
  const shipmentId = trackInfo?.shipment_id != null ? String(trackInfo.shipment_id) : undefined

  return activities.map((activity, idx) => ({
    id: shipmentId !== undefined ? `${shipmentId}-${idx}` : undefined,
    shipmentId,
    trackingNumber: trackInfo?.awb_code ?? trackingNumber,
    carrierId: trackInfo?.courier_name ?? undefined,
    status: mapTrackingStatus(activity.sr_status),
    description: activity.activity ?? undefined,
    location: activity.location ? toAddress({ city: activity.location }) : undefined,
    occurredAt: toISODate(activity.date),
    metadata: activity as Record<string, unknown>,
  }))
}
