/**
 * LISTABLE_RESOURCES — the set of (resourceType, adapter method) pairs the
 * background sync worker iterates over when fulfilling a sync job.
 */
export const LISTABLE_RESOURCES: Array<{ resourceType: string; method: string }> = [
  { resourceType: 'products', method: 'listProducts' },
  { resourceType: 'variants', method: 'listVariants' },
  { resourceType: 'collections', method: 'listCollections' },
  { resourceType: 'locations', method: 'listLocations' },
  { resourceType: 'inventory_levels', method: 'listInventoryLevels' },
  { resourceType: 'customers', method: 'listCustomers' },
  { resourceType: 'orders', method: 'listOrders' },
  { resourceType: 'fulfillments', method: 'listFulfillments' },
  { resourceType: 'refunds', method: 'listRefunds' },
  { resourceType: 'transactions', method: 'listTransactions' },
  { resourceType: 'discounts', method: 'listDiscounts' },
]
