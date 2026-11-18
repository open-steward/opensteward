/**
 * DHL Africa TrackingEvent → canonical TrackingEvent[].
 *
 * Re-exports the tracking transform so that both the `tracking` and
 * `trackingevent` canonical entities are served from the same raw data.
 */

export {
  transformTrackingEvents as transformTrackingEvent,
  type DhlAfricaTrackingResponse,
  type DhlAfricaTrackingEvent,
  type DhlAfricaTrackingLocation,
} from './tracking'
