export const metadata = {
  platform: 'bigcartel',
  totalResources: 10,
  availableResources: [
    'collection',
    'discount',
    'fulfillment',
    'order',
    'product',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'customer',
      reason:
        'No dedicated customer endpoint; buyer data is embedded in order responses only.',
    },
    {
      resource: 'inventory',
      reason:
        'No inventory level endpoint in the Big Cartel API; stock is tracked per-product only.',
    },
    {
      resource: 'location',
      reason:
        'No location concept in Big Cartel; the platform has no multi-location model.',
    },
    {
      resource: 'refund',
      reason:
        'No refund endpoint in the Big Cartel API; refund status is visible only as an order status.',
    },
  ],
} as const
