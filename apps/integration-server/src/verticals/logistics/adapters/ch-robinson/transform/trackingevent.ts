/**
 * C.H. Robinson tracking event → canonical TrackingEvent.
 *
 * Re-exports the canonical transform from tracking.ts so that both the
 * "tracking" and "trackingevent" entity names resolve to the same logic.
 * The Navisphere tracking API is documented at:
 * https://developer.chrobinson.com/
 */

export {
  transformTrackingEvents,
  type CHRTrackingResponse,
  type CHRTrackingEvent,
  type CHRTrackingLocation,
} from './tracking'
