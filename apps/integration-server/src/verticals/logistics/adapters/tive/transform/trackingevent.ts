/**
 * Tive tracking-event transform — canonical TrackingEvent entity.
 *
 * Tive is a real-time shipment-visibility platform. Events are returned within
 * the shipment object at `GET /shipments/{id}` as an `events[]` array. This
 * file is the canonical `trackingevent` entity entry-point; the full transform
 * logic lives in `./tracking.ts` and is re-exported here for schema-entity
 * alignment.
 */
export {
  transformTracking,
  mapStatus,
  type TiveTrackingResponse,
  type TiveTrackingEvent,
} from './tracking'
