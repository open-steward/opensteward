/**
 * Truckstop tracking-event transform.
 *
 * Re-exports the tracking-event transform from `tracking.ts` under the
 * canonical `trackingevent` entity name expected by the router.
 */
export {
  transformTrackingEvents as transformTrackingEvent,
  type TruckstopTenderResponse,
} from './tracking'
