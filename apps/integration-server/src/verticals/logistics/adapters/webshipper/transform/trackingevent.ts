/**
 * Webshipper TrackingEvent canonical transform.
 *
 * Webshipper exposes tracking events under `GET /tracking_events` with optional
 * filters by shipment id or tracking number. Each event is a JSON:API resource
 * with its own `id`, and event-level attributes for status, description,
 * event_time, and location.
 *
 * This file re-exports the transform functions from `tracking.ts` (which was
 * added before the canonical `trackingevent` entity name was standardised) so
 * that the audit covers the `trackingevent` entity name.
 *
 * Docs: https://docs.webshipper.io/
 */

export {
  transformTrackingEvent,
  transformTrackingEvents,
  type WebshipperTrackingEvent,
  type WebshipperTrackingListResponse,
  type WebshipperTrackingEventAttributes,
} from './tracking'
