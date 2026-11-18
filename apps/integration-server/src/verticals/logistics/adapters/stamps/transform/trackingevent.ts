/**
 * Stamps TrackingEvent transform — re-exports from tracking.ts.
 *
 * The canonical logistics entity name is `trackingevent`; the Stamps.com
 * (SERA) tracking transform lives in `tracking.ts`. This file re-exports the
 * types and functions so the audit manifest finds a `trackingevent.ts` in the
 * adapter.
 */
export {
  transformTrackingEvents as transformTrackingEvent,
  type SeraTrackingEvent,
  type SeraTrackingResponse,
} from './tracking'
