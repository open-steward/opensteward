export const metadata = {
  platform: 'erpag',
  totalResources: 7,
  availableResources: [
    'product',
    'stock-level',
    'supplier',
    'purchase-order',
  ],
  unavailableResources: [
    {
      resource: 'location',
      reason: 'ERPAG public API has no documented endpoint for warehouses/locations; only UI-based management is available.',
    },
    {
      resource: 'stock-adjustment',
      reason: 'ERPAG public API has no documented endpoint for stock adjustments; the concept exists only in the UI and QuickBooks sync.',
    },
    {
      resource: 'stock-transfer',
      reason: 'ERPAG public API has no documented endpoint for stock transfers; only UI-based warehouse transfers are available.',
    },
  ],
} as const
