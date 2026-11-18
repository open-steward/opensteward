export const metadata = {
  platform: 'inventory-planner',
  totalResources: 7,
  availableResources: [
    'product',
    'stock-level',
    'location',
    'supplier',
    'purchase-order',
  ],
  unavailableResources: [
    {
      resource: 'stock-adjustment',
      reason: 'Inventory Planner has no stock-adjustment concept or endpoint; adjustments are managed in the connected e-commerce/WMS platform',
    },
    {
      resource: 'stock-transfer',
      reason: 'Inventory Planner has no stock-transfer endpoint; transfers are managed in the connected e-commerce/WMS platform',
    },
  ],
} as const
