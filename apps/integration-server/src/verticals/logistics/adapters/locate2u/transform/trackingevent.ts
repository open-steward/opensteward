/**
 * Locate2u tracking-event transform — canonical TrackingEvent entity.
 *
 * Locate2u derives tracking events from shipment stop status fields returned
 * by `GET /shipments/{id}`. This file is the canonical `trackingevent` entity
 * entry-point; the full transform logic lives in `./tracking.ts` and is
 * re-exported here for schema-entity alignment.
 */
export {
  transformTracking,
  type Locate2uTracking,
  type Locate2uTrackingStop,
} from './tracking'
