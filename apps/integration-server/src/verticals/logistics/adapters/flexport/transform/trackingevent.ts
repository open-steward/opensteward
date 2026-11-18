/**
 * Flexport – TrackingEvent transform.
 *
 * Re-exports the tracking transform under the canonical entity name
 * (`trackingevent`) so that the adapter registry can resolve it by entity key.
 */
export {
  transformTrackingEvents as transformTrackingEvent,
  type FlexportLegsResponse,
  type FlexportShipmentLeg,
  type FlexportLegLocation,
} from './tracking'
