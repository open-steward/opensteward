export const metadata = {
  platform: 'shopee',
  totalResources: 10,
  availableResources: [
    'collection',
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
      resource: 'customer',
      reason: 'Shopee does not expose buyer/customer data via the seller Open Platform API.',
    },
    {
      resource: 'location',
      reason: 'Shopee manages fulfilment warehouses internally; no warehouse/location API is available to sellers.',
    },
  ],
} as const
