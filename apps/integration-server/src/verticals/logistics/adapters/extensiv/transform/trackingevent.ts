/**
 * Extensiv tracking-event transform.
 *
 * Re-exports the existing tracking transform under the canonical entity name.
 * Extensiv exposes tracking history via GET /tracking/{trackingNumber}.
 */
export {
  transformTracking as transformTrackingEvent,
  type ExtensivTrackingResponse,
  type ExtensivTrackingEvent,
} from './tracking'
