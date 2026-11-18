/**
 * e2open tracking-event transform — canonical TrackingEvent entity.
 *
 * e2open's partner-search / supply-chain visibility API exposes per-shipment
 * event history via `/shipments/{id}/tracking`. This file is the canonical
 * `trackingevent` entity entry-point; the full transform logic lives in
 * `./tracking.ts` and is re-exported here for schema-entity alignment.
 */
export {
  transformTrackingEvents,
  type E2openShipmentTrackingResponse,
  type E2openTrackingEventRaw,
  type E2openTrackingLocation,
} from './tracking'
