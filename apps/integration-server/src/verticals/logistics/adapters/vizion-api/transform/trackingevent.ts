/**
 * Vizion API TrackingEvent transform.
 *
 * Vizion provides ocean freight container tracking. This file is the
 * canonical thin wrapper that re-exports the transforms already defined
 * in tracking.ts so that the audit manifest's `trackingevent` entity is
 * satisfied.
 */

export {
  transformUpdateToTrackingEvents as transformTrackingEvent,
  transformMilestone,
  mapMilestoneStatus,
} from './tracking'
