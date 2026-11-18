export const metadata = {
  platform: 'prediko',
  totalResources: 7,
  availableResources: [
    'location',
    'product',
    'purchase-order',
    'stock-level',
    'supplier',
  ],
  unavailableResources: [
    {
      resource: 'stock-adjustment',
      reason: 'Prediko API has no stock-adjustment endpoints (confirmed via api.prediko.io/docs/api-reference)',
    },
    {
      resource: 'stock-transfer',
      reason: 'Prediko API has no stock-transfer endpoints (confirmed via api.prediko.io/docs/api-reference)',
    },
  ],
} as const
