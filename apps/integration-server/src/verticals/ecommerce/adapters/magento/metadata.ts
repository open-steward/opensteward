export const metadata = {
  platform: 'magento',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'transaction',
      reason:
        'Magento 2 / Adobe Commerce has no public REST endpoint for payment transactions; transaction data is internal to the payment gateway modules and is not exposed via the core /rest/V1 API.',
    },
  ],
} as const
