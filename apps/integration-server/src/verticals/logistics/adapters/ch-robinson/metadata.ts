export const metadata = {
  platform: 'ch-robinson',
  totalResources: 8,
  availableResources: ['label', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: C.H. Robinson developer portal (developer.chrobinson.com) requires authenticated access; no public documentation found for a /carriers or equivalent endpoint.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: C.H. Robinson developer portal (developer.chrobinson.com) requires authenticated access; no public documentation found for a /manifests or equivalent endpoint.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: C.H. Robinson developer portal (developer.chrobinson.com) requires authenticated access; no public documentation found for a /warehouses or equivalent endpoint.',
    },
  ],
} as const
