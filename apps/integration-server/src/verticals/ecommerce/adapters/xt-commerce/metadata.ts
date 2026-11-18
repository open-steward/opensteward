export const metadata = {
  platform: 'xt-commerce',
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
        'WooCommerce v3 REST API has no dedicated fulfillments resource; shipping data is embedded in orders with no per-shipment status, tracking, or carrier fields.',
    },
    {
      resource: 'transaction',
      reason:
        'WooCommerce v3 REST API exposes no transaction list endpoint; only a single transaction_id string on the order object.',
    },
  ],
} as const
