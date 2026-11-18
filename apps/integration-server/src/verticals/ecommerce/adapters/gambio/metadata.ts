export const metadata = {
  platform: 'gambio',
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
        'WooCommerce REST API v3 (the underlying API this adapter targets via /wp-json/wc/v3) has no transactions endpoint; payment data is embedded on order objects only and no separate transaction ledger is exposed.',
    },
  ],
} as const
