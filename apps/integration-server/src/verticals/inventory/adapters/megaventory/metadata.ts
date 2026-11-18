export const metadata = {
  platform: 'megaventory',
  totalResources: 7,
  availableResources: ['product', 'stock-level', 'location', 'supplier', 'purchase-order'],
  unavailableResources: [
    {
      resource: 'stock-transfer',
      reason:
        'Megaventory exposes no transfer resource. TransferGet, StockTransferGet and InventoryLocationTransferGet were each probed against the live v2017a service on 2026-09-18 and none resolves to a route; none appears in the service own 112-operation metadata index either.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'Megaventory exposes no adjustment resource. StockAdjustmentGet, AdjustmentGet and InventoryLocationStockAdjustmentGet were each probed against the live v2017a service on 2026-09-18 and none resolves to a route. Stock movement is recorded as Documents (DocumentGet), which is a document feed rather than adjustment records, so there is no entity to list or fetch by id.',
    },
  ],
} as const
