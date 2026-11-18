/**
 * Intelipost tracking-event transform — canonical TrackingEvent entity.
 *
 * Intelipost exposes tracking history inside a shipment order, per volume, as
 * `shipment_order_volume_array[].shipment_order_volume_state_history_array`.
 * This file is the canonical `trackingevent` entity entry-point; the transform
 * lives in `./tracking.ts` and is re-exported here for schema-entity alignment.
 */
export { transformVolumeToTrackingEvents } from './tracking'
