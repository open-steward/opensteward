/**
 * Top-level listables for background sync.
 */
export const LISTABLE_RESOURCES: Array<{ resourceType: string; method: string }> = [
  { resourceType: 'locations', method: 'listLocations' },
  { resourceType: 'suppliers', method: 'listSuppliers' },
  { resourceType: 'products', method: 'listProducts' },
  { resourceType: 'stock-levels', method: 'listStockLevels' },
  { resourceType: 'purchase-orders', method: 'listPurchaseOrders' },
  { resourceType: 'stock-transfers', method: 'listStockTransfers' },
  { resourceType: 'stock-adjustments', method: 'listStockAdjustments' },
]
