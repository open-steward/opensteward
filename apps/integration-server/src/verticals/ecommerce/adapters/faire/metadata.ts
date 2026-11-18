export const metadata = {
  platform: 'faire',
  totalResources: 10,
  availableResources: ['product', 'order', 'inventory'],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Faire External API v2 is brand-facing with no collection/category concept exposed to brands.',
    },
    {
      resource: 'customer',
      reason:
        'Faire has no customer endpoint; retailers appear only as retailer_id on wholesale orders.',
    },
    {
      resource: 'discount',
      reason:
        'Faire External API v2 does not expose discount or promotion management for brands.',
    },
    {
      resource: 'fulfillment',
      reason:
        'Faire shipments are nested inside orders (order.shipments), not separately addressable via a standalone fulfillment endpoint.',
    },
    {
      resource: 'location',
      reason:
        'Faire External API v2 does not expose warehouse or location resources; inventory is location-agnostic.',
    },
    {
      resource: 'refund',
      reason:
        'Faire External API v2 does not expose a refund endpoint; return/refund workflows are handled internally by the platform.',
    },
    {
      resource: 'transaction',
      reason:
        'Faire External API v2 does not expose payment transaction records; payments are settled by Faire internally.',
    },
  ],
} as const
