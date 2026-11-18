/**
 * Gophr UK / Velostics TrackingEvent transform.
 *
 * Gophr UK (Velostics) is an on-demand same-day courier API. This file
 * is the canonical thin wrapper that re-exports the transform already
 * defined in tracking.ts so that the audit manifest's `trackingevent`
 * entity is satisfied.
 */

export {
  transformTrackingEvents as transformTrackingEvent,
  type GophrUkTrackingResponse,
  type GophrUkTrackingEvent,
} from './tracking'
