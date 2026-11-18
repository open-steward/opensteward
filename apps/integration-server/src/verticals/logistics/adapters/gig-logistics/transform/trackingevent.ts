/**
 * GIG Logistics tracking-event transform.
 *
 * Re-exports the existing tracking transform under the canonical entity name.
 * GIGL exposes tracking history via GET /tracking/{waybillNumber}.
 */
export {
  transformTracker as transformTrackingEvents,
  type GigTracker,
  type GigTrackingDetail,
} from './tracking'
