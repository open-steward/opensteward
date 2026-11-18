import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate, toAddress } from '../../shared/transform'

export interface ShipKaroTrackingActivity {
  date?: string | null
  status?: string | null
  activity?: string | null
  location?: string | null
  sr_status?: string | null
  [key: string]: unknown
}

export interface ShipKaroTrackingShipment {
  id?: number | null
  awb_code?: string | null
  courier_company_id?: number | null
  courier_name?: string | null
  current_status?: string | null
  [key: string]: unknown
}

export interface ShipKaroTrackingData {
  tracking_data?: {
    track_status?: number | null
    shipment_status?: number | null
    shipment_track?: ShipKaroTrackingShipment[] | null
    shipment_track_activities?: ShipKaroTrackingActivity[] | null
    [key: string]: unknown
  } | null
  // Flat response shape — some endpoints return activities at root level
  activities?: ShipKaroTrackingActivity[] | null
  awb_code?: string | null
  courier_name?: string | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pickup_scheduled':
    case 'order_placed':
      return 'PRE_TRANSIT'
    case 'picked_up':
    case 'in_transit':
    case 'transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'rto_initiated':
    case 'rto':
    case 'rto_delivered':
      return 'RETURN_TO_SENDER'
    case 'lost':
    case 'exception':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(
  raw: ShipKaroTrackingData,
  shipmentId: string,
): TrackingEvent[] {
  // Support both nested (tracking_data) and flat (activities) response shapes
  const trackData = raw.tracking_data
  const activities =
    trackData?.shipment_track_activities ??
    raw.activities ??
    []
  const trackInfo = (trackData?.shipment_track ?? [])[0]
  const awb = trackInfo?.awb_code ?? raw.awb_code ?? undefined
  const carrier = trackInfo?.courier_name ?? raw.courier_name ?? undefined

  return activities.map((activity, idx) => ({
    id: `${shipmentId}-${idx}`,
    shipmentId,
    trackingNumber: awb ?? undefined,
    carrierId: carrier ?? undefined,
    status: mapTrackingStatus(activity.sr_status ?? activity.status),
    description: activity.activity ?? undefined,
    location: activity.location
      ? toAddress({ city: activity.location })
      : undefined,
    occurredAt: toISODate(activity.date),
    metadata: activity as Record<string, unknown>,
  }))
}
