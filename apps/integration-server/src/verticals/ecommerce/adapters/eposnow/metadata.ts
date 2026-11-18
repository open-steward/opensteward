export const metadata = {
  platform: 'eposnow',
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
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason:
        'Epos Now is a POS platform with no shipping or fulfillment concept; no fulfillment endpoint exists in the v4 API (confirmed via developer.eposnowhq.com/Docs/v4/index).',
    },
  ],
} as const
