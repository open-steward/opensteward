export const metadata = {
  platform: 'revel',
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
        'Revel is an iPad-native POS platform — no shipping or fulfillment concept exists; ' +
        'orders are completed in-store and there is no Fulfillment/Shipment resource in the API.',
    },
  ],
} as const
