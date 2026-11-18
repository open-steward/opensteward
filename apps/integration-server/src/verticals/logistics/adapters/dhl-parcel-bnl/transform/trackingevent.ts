/**
 * DHL Parcel BNL TrackingEvent transform — re-exports from tracking.ts.
 *
 * The canonical logistics entity name is `trackingevent`; the DHL Parcel BNL
 * tracking transform lives in `tracking.ts`. This file re-exports the types
 * and functions so the audit manifest finds a `trackingevent.ts` in the adapter.
 */
export {
  transformTracking as transformTrackingEvent,
  type DhlParcelBnlTrackingResponse,
  type DhlParcelBnlTrackingEvent,
} from './tracking'
