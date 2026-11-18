export const metadata = {
  platform: 'shipperhq',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent', 'rate'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'ShipperHQ exposes no list/get carrier endpoint; carrier data only appears embedded inside rate responses',
    },
    {
      resource: 'warehouse',
      reason: 'Origins/warehouses are dashboard-only configuration; the ShipperHQ API provides no endpoint to list or retrieve them',
    },
    {
      resource: 'manifest',
      reason: 'ShipperHQ provides no end-of-day or manifest API operation',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: createListing operation exists in the GraphQL library but the Labels API is closed beta behind enterprise gating; full field schema cannot be verified',
    },
  ],
} as const
