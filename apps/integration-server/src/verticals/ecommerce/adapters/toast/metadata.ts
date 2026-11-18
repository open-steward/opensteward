export const metadata = {
  platform: 'toast',
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
        'Toast is a restaurant POS with no shipping model; order delivery state (dine-in/takeout/delivery dispatch) does not map to the canonical Fulfillment resource (tracking number, carrier, shipment ID).',
    },
  ],
} as const
