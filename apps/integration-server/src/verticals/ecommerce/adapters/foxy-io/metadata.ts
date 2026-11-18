export const metadata = {
  platform: 'foxy-io',
  totalResources: 10,
  availableResources: [
    'customer',
    'discount',
    'fulfillment',
    'order',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Foxy has no product catalog or storefront collections; fx:item_categories are delivery-behavior groupings only, not shoppable collections.',
    },
    {
      resource: 'inventory',
      reason:
        'Foxy is checkout-as-a-service with no stock management; there are no inventory endpoints in the hAPI.',
    },
    {
      resource: 'location',
      reason:
        'Foxy has no physical warehouse or store location concept; no fx:locations resource exists in the hAPI.',
    },
    {
      resource: 'product',
      reason:
        'Foxy has no product catalog; products are inline transaction line items (name, price, code) with no dedicated product resource or endpoint.',
    },
    {
      resource: 'refund',
      reason:
        'Foxy exposes a conditional per-transaction refund action link (gateway-dependent) rather than a listable fx:refunds collection; individual refund records cannot be listed or fetched.',
    },
  ],
} as const
