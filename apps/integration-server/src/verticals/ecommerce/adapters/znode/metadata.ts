export const metadata = {
  platform: 'znode',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'inventory',
    'location',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason:
        'Znode has no dedicated fulfillment REST resource; shipment state is encoded in OrderStateId (3=Shipped, 4=Delivered) on the order object.',
    },
    {
      resource: 'refund',
      reason:
        'Znode has no dedicated refund REST resource; return/refund state is encoded in OrderStateId (6=Returned) on the order object.',
    },
    {
      resource: 'transaction',
      reason:
        'Znode has no payment transaction REST resource; payment is handled by external gateway integrations with no transaction sub-resource exposed via the API.',
    },
  ],
} as const
