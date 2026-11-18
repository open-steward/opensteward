export const metadata = {
  platform: 'iqmetrix',
  totalResources: 7,
  availableResources: [
    'location',
    'product',
    'purchase-order',
    'stock-adjustment',
    'stock-level',
    'supplier',
  ],
  unavailableResources: [
    {
      resource: 'stock-transfer',
      reason:
        'iQmetrix provides no public read/list endpoint for stock transfers. The VIS API offers an async write-only "Create a Transfer Request" (POST) with no listing or full-record retrieval; the only GET endpoint returns creation status and transferId only — insufficient to populate the canonical StockTransfer schema.',
    },
  ],
} as const
