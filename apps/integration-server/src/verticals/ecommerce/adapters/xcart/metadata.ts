export const metadata = {
  platform: 'xcart',
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
        'X-Cart REST API has no location resource; the platform is a single-install self-hosted system with no multi-location / fulfillment-center concept exposed via REST.',
    },
  ],
} as const
