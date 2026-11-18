/**
 * SAP TM – TrackingEvent transform.
 *
 * Re-exports the tracking transform under the canonical entity name
 * (`trackingevent`) so that the adapter registry can resolve it by entity key.
 */
export {
  transformTrackingEvents as transformTrackingEvent,
  type SapTmTrackingResponse,
  type SapTmTrackingEvent,
  type SapTmTrackingLocation,
} from './tracking'
