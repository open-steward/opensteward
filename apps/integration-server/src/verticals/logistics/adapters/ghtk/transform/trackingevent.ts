/**
 * GHTK TrackingEvent transform.
 *
 * GHTK (Giao Hang Tiet Kiem) is a Vietnamese courier whose tracking
 * endpoint returns an event array. This file is the canonical thin
 * wrapper that re-exports the transform already defined in tracking.ts
 * so that the audit manifest's `trackingevent` entity is satisfied.
 */

export {
  transformTracking as transformTrackingEvent,
  type GhtkTrackingResponse,
  type GhtkTrackingEventRaw,
} from './tracking'
