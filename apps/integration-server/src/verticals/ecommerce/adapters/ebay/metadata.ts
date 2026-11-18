export const metadata = {
  platform: 'ebay',
  totalResources: 11,
  availableResources: [
    'product',
    'variant',
    'collection',
    'location',
    'inventory',
    'order',
    'fulfillment',
    'refund',
    'transaction',
    'discount',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'eBay does not expose a buyer/customer identity resource to sellers; buyer info is embedded in order objects only.',
    },
  ],
} as const
