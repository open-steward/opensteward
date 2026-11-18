export const metadata = {
  platform: 'loyverse',
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
        'Loyverse is a POS system; sales are fulfilled implicitly at the point of sale. No fulfillment or shipment endpoint exists in the Loyverse API.',
    },
  ],
} as const
