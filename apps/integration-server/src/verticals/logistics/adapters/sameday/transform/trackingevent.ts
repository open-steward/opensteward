/**
 * Sameday tracking-event transform.
 *
 * Re-exports the existing tracking transform under the canonical entity name.
 * Sameday exposes AWB status history via GET /api/client/awb/{awb}/status.
 */
export {
  transformStatusHistory as transformTrackingEvents,
} from './tracking'
