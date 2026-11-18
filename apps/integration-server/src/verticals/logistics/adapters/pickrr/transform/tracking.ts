import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate, toAddress } from '../../shared/transform'

export interface PickrrTrackingActivity {
  status: string | null
  activity: string | null
  location: string | null
  city: string | null
  state: string | null
  timestamp: string | null
  date_time: string | null
  [key: string]: unknown
}

export interface PickrrTrackingResponse {
  success: boolean | null
  tracking_id: string | null
  courier: string | null
  current_status: string | null
  scan_details: PickrrTrackingActivity[] | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('delivered') && !s.includes('rto')) return 'DELIVERED'
  if (s.includes('out_for_delivery') || s.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('rto') || s.includes('return')) return 'RETURN_TO_SENDER'
  if (s.includes('in_transit') || s.includes('in transit') || s.includes('dispatched') || s.includes('transit')) return 'IN_TRANSIT'
  if (s.includes('pickup') || s.includes('booked') || s.includes('label') || s.includes('manifest')) return 'PRE_TRANSIT'
  if (s.includes('exception') || s.includes('lost') || s.includes('ndr') || s.includes('failed')) return 'FAILURE'
  return 'UNKNOWN'
}

export function transformTracking(
  raw: PickrrTrackingResponse,
  trackingNumber: string,
): TrackingEvent[] {
  const activities = raw.scan_details ?? []

  return activities.map((activity, idx) => ({
    id: `${trackingNumber}-${idx}`,
    shipmentId: trackingNumber,
    trackingNumber: raw.tracking_id ?? trackingNumber,
    carrierId: raw.courier ?? undefined,
    status: mapTrackingStatus(activity.status),
    description: activity.activity ?? undefined,
    location: (activity.city ?? activity.location)
      ? toAddress({
          city: activity.city ?? activity.location,
          state: activity.state,
        })
      : undefined,
    occurredAt: toISODate(activity.timestamp ?? activity.date_time),
    metadata: activity as Record<string, unknown>,
  }))
}
