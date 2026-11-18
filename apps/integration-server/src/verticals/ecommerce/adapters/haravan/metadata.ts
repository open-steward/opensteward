export const metadata = {
  platform: 'haravan',
  totalResources: 11,
  availableResources: [
    'product',
    'variant',
    'collection',
    'location',
    'inventory',
    'customer',
    'order',
    'refund',
    'transaction',
    'discount',
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason: 'Haravan has no separate Fulfillment resource — /docs/omni-apis/fulfillments/ redirects to the Orders page, and shipment state is only fields on Order (fulfillment_status, embedded fulfillments: []), never a createable/cancelable sub-resource.',
    },
  ],
} as const
