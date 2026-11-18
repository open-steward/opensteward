export const metadata = {
  platform: 'recharge',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'inventory',
    'location',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason:
        'Recharge 2021-11 has no fulfillments endpoint; fulfillment is delegated to the underlying ecommerce platform (e.g. Shopify)',
    },
  ],
} as const
