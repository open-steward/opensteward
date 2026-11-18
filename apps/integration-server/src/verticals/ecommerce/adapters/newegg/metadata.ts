export const metadata = {
  platform: 'newegg',
  totalResources: 10,
  availableResources: [
    'fulfillment',
    'inventory',
    'order',
    'product',
    'refund',
    'discount',
    'location',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Newegg is a pure marketplace; no seller-side storefront collections exist in the API',
    },
    {
      resource: 'customer',
      reason: 'No customer profile endpoints; buyer info is embedded in orders only',
    },
    {
      resource: 'transaction',
      reason: 'Settlement transactions are exposed only via async batch reports, not a direct REST resource endpoint',
    },
  ],
} as const
