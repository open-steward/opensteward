/**
 * ClickPost TrackingEvent transform — re-exports from tracking.ts.
 *
 * The canonical logistics entity name is `trackingevent`; the ClickPost tracking
 * transform lives in `tracking.ts`. This file re-exports the types and functions
 * so the audit manifest finds a `trackingevent.ts` in the adapter.
 */
export {
  transformTrackingResult as transformTrackingEvent,
  type ClickPostTrackingResult,
  type ClickPostScan,
} from './tracking'
