export const metadata = {
  platform: 'gumroad',
  totalResources: 10,
  availableResources: [
    'product',
    'order',
    'customer',
    'discount',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason: 'Gumroad has no collection or category API — digital products are not grouped into collections.',
    },
    {
      resource: 'fulfillment',
      reason: 'Digital delivery is instant upon purchase; Gumroad has no fulfillment tracking endpoint.',
    },
    {
      resource: 'inventory',
      reason: 'Digital products have no stock levels; Gumroad has no inventory endpoint.',
    },
    {
      resource: 'location',
      reason: 'Digital-only platform; no warehouse or location endpoint exists in the Gumroad API.',
    },
    {
      resource: 'transaction',
      reason: 'No financial transaction resource is exposed in the Gumroad API.',
    },
  ],
} as const
