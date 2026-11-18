/**
 * Melhor Envio tracking-event transform.
 *
 * Re-exports the tracking-event transform from `tracking.ts` under the
 * canonical `trackingevent` entity name expected by the router.
 */
export {
  transformTracking as transformTrackingEvent,
  type MelhorEnvioTrackingResponse,
} from './tracking'
