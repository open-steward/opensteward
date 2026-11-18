export const metadata = {
  platform: 'allegro',
  totalResources: 10,
  availableResources: [
    'collection',
    'discount',
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'Allegro does not expose a buyer/customer resource endpoint; buyer data is embedded in checkout-form (order) responses only and there is no list/get customer API.',
    },
  ],
} as const
