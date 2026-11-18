export const metadata = {
  platform: 'ankorstore',
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
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason:
        'WooCommerce REST API v3 has no fulfillments endpoint; fulfillment state is encoded in order status only (completed = fulfilled), with no dedicated fulfillment object or /fulfillments resource.',
    },
    {
      resource: 'transaction',
      reason:
        'WooCommerce REST API v3 has no transactions endpoint; payment transaction data is not exposed as a separate resource — only refunds are accessible separately.',
    },
  ],
} as const
