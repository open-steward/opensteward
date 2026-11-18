/**
 * Parcel2Go tracking event → canonical TrackingEvent.
 *
 * Individual tracking events are exposed as part of the tracking response
 * (GET /api/tracking/{orderLineId}).  This module re-exports the shared
 * transform so the canonical `trackingevent` entity has a dedicated file
 * consistent with the adapter convention, while avoiding logic duplication.
 */
export {
  transformTrackingResult,
  type Parcel2GoTrackingResult,
  type Parcel2GoTrackingEvent,
} from './tracking'
