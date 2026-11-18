export const metadata = {
  platform: 'starweb',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'discount',
      reason:
        'Starweb API v2 has no voucher/discount-code endpoint; confirmed absent from the full auto-generated SDK endpoint list (starweb/shop-api-sdk-php).',
    },
    {
      resource: 'refund',
      reason:
        'Starweb API v2 has no refund endpoint; confirmed absent from the full auto-generated SDK endpoint list (starweb/shop-api-sdk-php).',
    },
    {
      resource: 'transaction',
      reason:
        'Starweb API v2 has no payment-transaction endpoint; payment methods are read-only reference data only, confirmed from the full auto-generated SDK endpoint list (starweb/shop-api-sdk-php).',
    },
  ],
} as const
