export const metadata = {
  platform: 'nextbillion-ai',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'NextBillion.ai is a routing/optimization/tracking platform and has no carrier management concept or endpoint.',
    },
    {
      resource: 'label',
      reason:
        'NextBillion.ai does not provide shipping-label generation; no label endpoints exist in the public API.',
    },
    {
      resource: 'manifest',
      reason:
        'NextBillion.ai has no manifest concept or endpoint; it is not a parcel-carrier platform.',
    },
    {
      resource: 'rate',
      reason:
        'NextBillion.ai offers route optimisation but not carrier rate-quoting; no rate endpoints exist.',
    },
    {
      resource: 'warehouse',
      reason:
        'Depots are inline parameters within optimization request bodies, not managed warehouse resources with their own CRUD endpoints.',
    },
  ],
} as const
