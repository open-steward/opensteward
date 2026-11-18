/**
 * Nova Poshta individual tracking-event transform.
 *
 * Re-exports `transformTrackingResponse` from the existing tracking module
 * under the canonical entity name so the audit manifest's `trackingevent`
 * entity is satisfied. The per-shipment `listTrackingEvents` implementation
 * in index.ts already calls `transformTrackingResponse`; this file provides
 * the named export expected by the transform-audit tooling.
 *
 * Docs: https://api-portal.novapost.com/
 */
export {
  transformTrackingResponse as transformTrackingEvent,
  type NovaPoshtaTrackingResponse as NovaPoshtaTrackingEventResponse,
  type NovaPoshtaTrackingEntry,
  type NovaPoshtaCurrentStatus,
} from './tracking'
