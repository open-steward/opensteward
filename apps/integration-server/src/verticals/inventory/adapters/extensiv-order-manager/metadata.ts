export const metadata = {
  platform: 'extensiv-order-manager',
  totalResources: 7,
  availableResources: [
    'location',
    'product',
    'purchase-order',
    'stock-level',
    'stock-transfer',
    'supplier',
  ],
  unavailableResources: [
    {
      resource: 'stock-adjustment',
      reason: 'Extensiv Order Manager API has no endpoint to list or retrieve inventory adjustment records; the only inventory-write surface is POST /service/v1.2/inventory/acknowledge (channel-listing acknowledge), which does not expose adjustment history.',
    },
  ],
} as const
