export const metadata = {
  platform: 'dukaan',
  totalResources: 10,
  availableResources: [
    'collection',
    'customer',
    'discount',
    'order',
    'product',
  ],
  unavailableResources: [
    {
      resource: 'fulfillment',
      reason:
        'Dukaan Seller REST API has no fulfillment or shipment endpoint; shipping is handled via third-party plugins (Shippo, Unicommerce) outside the seller API.',
    },
    {
      resource: 'inventory',
      reason:
        'Dukaan Seller REST API has no inventory-level endpoint; stock quantities are embedded in product/variant objects and cannot be queried or adjusted independently.',
    },
    {
      resource: 'location',
      reason:
        'Dukaan Seller REST API has no location or warehouse endpoint; the platform does not expose multi-location fulfillment via its public API.',
    },
    {
      resource: 'refund',
      reason:
        'Dukaan Seller REST API has no refund endpoint; refund management is handled through the seller dashboard UI, not programmatically via the public API.',
    },
    {
      resource: 'transaction',
      reason:
        'Dukaan Seller REST API has no transaction or payment endpoint; payment processing is handled by integrated payment gateways and is not exposed in the seller API.',
    },
  ],
} as const
