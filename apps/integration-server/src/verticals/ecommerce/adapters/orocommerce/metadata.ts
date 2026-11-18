export const metadata = {
  platform: 'orocommerce',
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
        'OroCommerce has no standalone fulfillment/shipment REST resource; shipping tracking is embedded as OrderShippingTracking sub-entities on the order, not a separate API resource.',
    },
    {
      resource: 'refund',
      reason:
        'OroCommerce PaymentBundle does not expose refunds via its JSON:API layer; refund operations are handled internally and are not accessible through the REST API.',
    },
    {
      resource: 'transaction',
      reason:
        'OroCommerce PaymentBundle does not expose payment transactions via its JSON:API layer; the PaymentTransaction entity has no REST endpoint configured.',
    },
  ],
} as const
