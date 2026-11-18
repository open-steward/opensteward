export const metadata = {
  platform: 'pickware',
  totalResources: 7,
  availableResources: [
    'location',
    'product',
    'stock-level',
    'supplier',
  ],
  unavailableResources: [
    {
      resource: 'purchase-order',
      reason: 'No purchase order concept or endpoint in Shopware 5 or Pickware ERP REST API',
    },
    {
      resource: 'stock-adjustment',
      reason: 'Pickware stock change (PUT /api/stock/change) is write-only; no list/get endpoint for historical adjustments',
    },
    {
      resource: 'stock-transfer',
      reason: 'Pickware stock relocate (PUT /api/stock/relocate) is write-only; no list/get endpoint for historical transfers',
    },
  ],
} as const
