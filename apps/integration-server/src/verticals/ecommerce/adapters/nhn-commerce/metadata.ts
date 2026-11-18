export const metadata = {
  platform: 'nhn-commerce',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'inventory',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'location',
      reason:
        'The Shopby shop API (shop-api.e-ncp.com) is single-location and member-scoped; warehouse data exists only in the separate server API (server-api.e-ncp.com) which requires a systemKey credential outside this adapter\'s auth model.',
    },
  ],
} as const
