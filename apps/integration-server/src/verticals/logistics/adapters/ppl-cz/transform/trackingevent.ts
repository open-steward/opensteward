/**
 * PPL CZ TrackingEvent transform.
 *
 * Re-exports the TrackingEvent transform from tracking.ts so that the
 * canonical `trackingevent` entity is explicitly covered.  The underlying
 * implementation is in `tracking.ts`; this file provides the canonical
 * name for the audit trail.
 */

export {
  transformParcelStatus as transformTrackingEvent,
  type PplCzParcelStatus as RawPplCzTrackingEvent,
  type PplCzTrackingEvent,
  type PplCzTrackingLocation,
} from './tracking'
