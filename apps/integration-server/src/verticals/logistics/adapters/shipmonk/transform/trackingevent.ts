/**
 * ShipMonk TrackingEvent → canonical TrackingEvent[].
 *
 * Re-exports the tracking transform so that both the `tracking` and
 * `trackingevent` canonical entities are served from the same raw data.
 */

export {
  transformTracking as transformTrackingEvent,
  type ShipmonkTrackingResponse,
  type ShipmonkTrackingEvent,
} from './tracking'
