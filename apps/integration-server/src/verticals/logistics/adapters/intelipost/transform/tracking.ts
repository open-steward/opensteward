import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import {
  nonEmpty,
  type IntelipostShipmentOrderRaw,
  type IntelipostShipmentOrderVolume,
  type IntelipostVolumeLocation,
} from './shipment'

// ─── Status mapping ──────────────────────────────────────────────────────────
//
// History entries carry `shipment_order_volume_state`, whose values are the
// documented `shipment_volume_state` list of `GET /tracking/micro_states`.

function mapStatus(raw: string | null | undefined): TrackingEventStatus {
  switch (raw) {
    case 'NEW':
    case 'CREATED_AT_LOGISTIC_PROVIDER':
    case 'LABEL_CREATED':
    case 'READY_FOR_SHIPPING':
    case 'WAITING_FOR_DROP_OFF':
      return 'PRE_TRANSIT'
    case 'SHIPPED':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'
    case 'TO_BE_DELIVERED':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CLARIFY_ADDRESS':
    case 'CLARIFY_LABEL_FAIL':
    case 'CLARIFY_DELIVERY_FAIL':
    case 'DELIVERY_FAILED':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

function toLocation(loc: IntelipostVolumeLocation | null | undefined): Address | undefined {
  if (!loc) return undefined
  const street1 = [loc.address, loc.number].filter((p) => nonEmpty(p) !== undefined).join(', ')
  const street2 = [loc.additional, loc.quarter].filter((p) => nonEmpty(p) !== undefined).join(', ')
  const addr: Address = {
    street1: nonEmpty(street1),
    street2: nonEmpty(street2),
    city: nonEmpty(loc.city),
    state: nonEmpty(loc.state_code),
    postalCode: nonEmpty(loc.zip_code),
  }
  const entries = Object.entries(addr).filter(([, v]) => v !== undefined)
  return entries.length > 0 ? (Object.fromEntries(entries) as Address) : undefined
}

// ─── Transform ───────────────────────────────────────────────────────────────

/**
 * One canonical TrackingEvent per entry of a volume's documented
 * `shipment_order_volume_state_history_array`. A volume with no history yields
 * no events: its current `shipment_order_volume_state` is not an event.
 *
 * The event id is the entry's own `shipment_order_volume_state_history` number.
 */
export function transformVolumeToTrackingEvents(
  order: IntelipostShipmentOrderRaw,
  volume: IntelipostShipmentOrderVolume,
): TrackingEvent[] {
  return (volume.shipment_order_volume_state_history_array ?? []).map((entry): TrackingEvent => ({
    id:
      entry.shipment_order_volume_state_history != null
        ? String(entry.shipment_order_volume_state_history)
        : undefined,
    shipmentId: nonEmpty(order.order_number),
    trackingNumber: nonEmpty(volume.tracking_code),
    carrierId: nonEmpty(order.logistic_provider_name),
    status: mapStatus(entry.shipment_order_volume_state),
    description: nonEmpty(entry.shipment_order_volume_state_localized),
    location: toLocation(entry.location),
    occurredAt: toISODate(entry.event_date_iso),
    createdAt: toISODate(entry.created_iso),
    metadata: entry as Record<string, unknown>,
  }))
}
