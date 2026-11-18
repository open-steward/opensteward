export const metadata = {
  platform: 'wonderment',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Wonderment is a post-purchase tracking platform; its public API exposes only shipment search and delivery-promise predictions — no carrier management endpoints exist.',
    },
    {
      resource: 'label',
      reason:
        'Wonderment does not generate or manage shipping labels; label creation is not part of its API.',
    },
    {
      resource: 'manifest',
      reason:
        'Wonderment does not support manifest/end-of-day close-out operations; no manifest endpoint exists in its API.',
    },
    {
      resource: 'order',
      reason:
        'Wonderment ingests order data from Shopify/other platforms internally but exposes no order CRUD API endpoint.',
    },
    {
      resource: 'rate',
      reason:
        'Wonderment offers a delivery-promise predictions endpoint for ETA estimates at checkout but does not expose carrier rate-shopping; no rate endpoint exists.',
    },
    {
      resource: 'warehouse',
      reason:
        'Wonderment does not manage warehouse locations through its API; no warehouse endpoint exists.',
    },
  ],
} as const
