export const metadata = {
  platform: 'clover',
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
        'Clover is a POS/payments platform — it has no shipping, carrier, or fulfillment lifecycle concept in its REST API.',
    },
  ],
} as const
