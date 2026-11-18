export const metadata = {
  platform: 'manomano',
  totalResources: 10,
  availableResources: [
    'collection',
    'fulfillment',
    'inventory',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'ManoMano has no Customers API; buyer data is embedded in order responses only (no list/get endpoint).',
    },
    {
      resource: 'discount',
      reason:
        'ManoMano has no Discounts or Promotions API for sellers; confirmed absent from all public documentation.',
    },
    {
      resource: 'location',
      reason:
        'ManoMano has no Locations or Warehouses API; seller fulfilment locations are not exposed via the Partners API.',
    },
    {
      resource: 'transaction',
      reason:
        'ManoMano has no Transactions or Payments API; payment data is not exposed to sellers via the Partners API.',
    },
  ],
} as const
