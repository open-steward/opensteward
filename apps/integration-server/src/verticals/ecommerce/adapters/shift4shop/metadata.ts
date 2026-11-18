export const metadata = {
  platform: 'shift4shop',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'inventory',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'location',
      reason:
        'Shift4Shop REST API has no locations endpoint; warehouse data is embedded as fields on order items (ItemWarehouseID etc.), not exposed as a queryable resource.',
    },
  ],
} as const
