/**
 * TNT tracking-event transform.
 *
 * Re-exports the existing tracking transform under the canonical entity name.
 * TNT exposes tracking history via GET /shipment/{trackingNumber}.
 */
export {
  transformTracking as transformTrackingEvents,
  type TntTracking,
  type TntStatusEvent,
} from './tracking'
