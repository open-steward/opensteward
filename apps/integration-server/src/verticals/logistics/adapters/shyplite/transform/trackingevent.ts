/**
 * Shyplite TrackingEvent list → canonical TrackingEvent[].
 *
 * Shyplite returns per-scan events on the tracking endpoint. This
 * transform re-uses the shared tracking shape and produces the
 * canonical TrackingEvent objects required by listTrackingEvents.
 *
 * Re-exports the tracking transform so that both the `tracking` and
 * `trackingevent` canonical entities are served from the same raw data.
 */

export {
  transformTracking as transformTrackingEvent,
  type ShypliteTracking,
  type ShypliteTrackingEvent,
} from './tracking'
