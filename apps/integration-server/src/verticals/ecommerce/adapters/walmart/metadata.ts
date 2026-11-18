export const metadata = {
  platform: 'walmart',
  totalResources: 10,
  availableResources: [
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Walmart has taxonomy/category endpoints for item classification but no seller-managed product collection resource (no list/get/create CRUD).',
    },
    {
      resource: 'customer',
      reason:
        'Walmart does not expose buyer/customer profiles to marketplace sellers via the API; buyer identities are withheld.',
    },
    {
      resource: 'discount',
      reason:
        'Walmart supports promotional pricing (item-level price reductions via feed uploads) but has no standalone discount code or coupon resource with list/get endpoints.',
    },
  ],
} as const
