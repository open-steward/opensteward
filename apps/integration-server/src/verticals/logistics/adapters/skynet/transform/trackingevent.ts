/**
 * SkyNet TrackingEvent transform.
 *
 * SkyNet Worldwide Express is a Southeast-Asian and Middle-Eastern
 * courier. This file is the canonical thin wrapper that re-exports the
 * transform already defined in tracking.ts so that the audit manifest's
 * `trackingevent` entity is satisfied.
 */

export {
  transformTracking as transformTrackingEvent,
  type SkynetTracking,
  type SkynetTrackingEvent,
} from './tracking'
