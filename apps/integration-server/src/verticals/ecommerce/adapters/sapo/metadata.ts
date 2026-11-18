export const metadata = {
  platform: 'sapo',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'fulfillment',
    'order',
    'product',
    'refund',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'inventory',
      reason:
        'Sapo REST API has no dedicated inventory level endpoints; stock is tracked inline on product variants via inventory_quantity only, with no multi-location support.',
    },
    {
      resource: 'location',
      reason:
        'Sapo REST API does not expose a locations resource; no /admin/locations.json or equivalent endpoint is documented.',
    },
  ],
} as const
