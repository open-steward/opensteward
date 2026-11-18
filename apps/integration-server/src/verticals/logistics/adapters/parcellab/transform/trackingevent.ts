/**
 * parcelLab tracking event → canonical TrackingEvent.
 *
 * Re-exports the canonical transform from tracking.ts so that both the
 * "tracking" and "trackingevent" entity names resolve to the same logic.
 * See: https://how.parcellab.works/docs/
 */

export {
  transformTracking,
  type ParcellabTracking,
  type ParcellabCheckpoint,
} from './tracking'
