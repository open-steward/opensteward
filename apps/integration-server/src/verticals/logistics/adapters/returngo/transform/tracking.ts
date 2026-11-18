import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { ReturnGoRma } from './rma'

/**
 * Map a ReturnGO RMA/shipment status to a canonical TrackingEventStatus.
 */
function mapStatusToTrackingStatus(
  shipmentStatus: string | null | undefined,
  returnStatus: string | null | undefined,
): TrackingEventStatus {
  const s = (shipmentStatus ?? returnStatus ?? '').toLowerCase()

  if (!s || s.includes('pending') || s.includes('submitted')) return 'PRE_TRANSIT'
  if (s.includes('label')) return 'PRE_TRANSIT'
  if (s.includes('out_for_delivery') || s.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('transit') || s.includes('shipped') || s.includes('in_transit')) return 'IN_TRANSIT'
  if (s.includes('received') || s.includes('arrived') || s.includes('delivered') || s.includes('complete')) return 'DELIVERED'
  if (s.includes('pickup') || s.includes('available_for_pickup')) return 'AVAILABLE_FOR_PICKUP'
  if (s.includes('return_to_sender')) return 'RETURN_TO_SENDER'
  if (s.includes('exception') || s.includes('failed') || s.includes('rejected') || s.includes('cancel')) return 'FAILURE'
  return 'UNKNOWN'
}

/**
 * Transform a ReturnGO RMA record into one canonical TrackingEvent.
 * ReturnGO does not expose checkpoint-level tracking via the RMA API —
 * each RMA yields a single summary tracking event derived from its status.
 */
export function transformRmaToTrackingEvent(raw: ReturnGoRma): TrackingEvent {
  const shipmentStatus = raw.shipment?.status ?? undefined
  const returnStatus = raw.return_status ?? raw.status ?? undefined
  const status = mapStatusToTrackingStatus(shipmentStatus, returnStatus)

  const trackingNumber =
    raw.tracking_number ?? raw.shipment?.tracking_number ?? undefined
  const carrierId = raw.carrier ?? raw.shipment?.carrier ?? undefined

  return {
    trackingNumber: trackingNumber ?? undefined,
    carrierId: carrierId ?? undefined,
    status,
    description: returnStatus ?? undefined,
    occurredAt: toISODate(raw.updated_at ?? raw.created_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
