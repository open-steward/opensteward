export const metadata = {
  platform: 'brink-commerce',
  totalResources: 10,
  availableResources: [
    'discount',
    'fulfillment',
    'inventory',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Brink Commerce has no catalog grouping or collection concept in its API',
    },
    {
      resource: 'customer',
      reason: 'Brink Commerce has no customer entity; shopper sessions are anonymous',
    },
    {
      resource: 'location',
      reason: 'Brink Commerce uses warehouse IDs for inventory but exposes no Location API endpoint',
    },
    {
      resource: 'transaction',
      reason: 'Payment processing is fully delegated to external providers (Klarna, Adyen, etc.); no transaction endpoint exists',
    },
  ],
} as const
