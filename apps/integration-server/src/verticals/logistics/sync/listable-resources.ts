/**
 * LISTABLE_RESOURCES — the set of (resourceType, adapter method) pairs the
 * background sync worker iterates over when fulfilling a sync job.
 *
 * Kept separate from the shared Zod job/progress schemas
 * (packages/shared/src/data-store/sync-schema.ts) so the vertical-specific
 * resource registry stands alone.
 */
export const LISTABLE_RESOURCES: Array<{ resourceType: string; method: string }> = [
  { resourceType: 'shipments', method: 'listShipments' },
  { resourceType: 'orders', method: 'listOrders' },
  { resourceType: 'carriers', method: 'listCarriers' },
  { resourceType: 'warehouses', method: 'listWarehouses' },
  { resourceType: 'trackingevents', method: 'listTrackingEvents' },
  { resourceType: 'labels', method: 'listLabels' },
  { resourceType: 'manifests', method: 'listManifests' },
]
