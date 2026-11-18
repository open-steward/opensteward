/**
 * Pitney Bowes TrackingEvent transform — canonical entity alias.
 *
 * The Pitney Bowes tracking logic lives in `tracking.ts` which exports
 * `transformTrackingEvents` returning `TrackingEvent[]`. This file re-exports
 * under the canonical entity name so the audit manifest can locate it as
 * `trackingevent.ts`.
 */
export {
  transformTrackingEvents as transformTrackingEvent,
  type PitneyBowesTrackingResponse,
  type PitneyBowesScanEvent,
} from './tracking'
