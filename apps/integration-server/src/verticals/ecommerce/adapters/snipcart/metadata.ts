export const metadata = {
  platform: 'snipcart',
  totalResources: 10,
  availableResources: ['product', 'customer', 'order', 'refund', 'discount'],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Snipcart has no concept of product collections — the REST API offers no collections endpoint.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Snipcart does not expose a fulfillment/shipment sub-resource; tracking fields (trackingNumber, trackingUrl) are embedded directly on the order object.',
    },
    {
      resource: 'inventory',
      reason:
        'Snipcart inventory is managed as a stock count on the product/variant object; there are no separate inventory-level or location-based inventory endpoints.',
    },
    {
      resource: 'location',
      reason:
        'Snipcart does not support multi-location warehousing and has no locations endpoint.',
    },
    {
      resource: 'transaction',
      reason:
        'Snipcart exposes payment status on the order (paymentStatus field) but has no standalone transaction read endpoint in its REST API.',
    },
  ],
} as const
