export const metadata = {
  platform: 'rakuten',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'inventory',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'location',
      reason:
        'Rakuten manages logistics centrally; no seller location or warehouse endpoint exists in the RMS API',
    },
    {
      resource: 'refund',
      reason:
        'Rakuten refunds are processed internally by Rakuten\'s payment system; no seller-facing refund API endpoint exists in the RMS API',
    },
    {
      resource: 'transaction',
      reason:
        'No dedicated transaction or payment history endpoint is exposed to sellers; payment info is embedded in orders as settlementInfo only',
    },
  ],
} as const
