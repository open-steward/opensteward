/**
 * Shiptheory tracking-event transform.
 *
 * Re-exports the existing tracking transform under the canonical entity name.
 * Shiptheory synthesises tracking events from shipment status records.
 */
export {
  transformShipmentToTrackingEvents as transformTrackingEvents,
} from './tracking'
