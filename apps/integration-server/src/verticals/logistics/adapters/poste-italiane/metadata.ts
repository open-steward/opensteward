export const metadata = {
  platform: 'poste-italiane',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: api.poste.it/v1 requires authenticated developer credentials; no public documentation confirms a /carriers or equivalent endpoint.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: api.poste.it/v1 requires authenticated developer credentials; no public documentation confirms a /labels or equivalent endpoint.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: api.poste.it/v1 requires authenticated developer credentials; no public documentation confirms a /manifests or equivalent endpoint.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: api.poste.it/v1 requires authenticated developer credentials; no public documentation confirms an /orders or equivalent endpoint.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: api.poste.it/v1 requires authenticated developer credentials; no public documentation confirms a /warehouses or equivalent endpoint.',
    },
  ],
} as const
