/**
 * Track-POD – TrackingEvent transform (canonical entity alias).
 *
 * Re-exports the tracking transform under the canonical entity name
 * (`trackingevent`) so that the adapter registry can resolve it by entity key.
 */
export { transformTracking as transformTrackingEvent } from './tracking'
export type { TrackPodOrder } from './order'
