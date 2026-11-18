export const metadata = {
  platform: 'skydropx',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'Skydropx API (docs.skydropx.com) has no manifest endpoint; the platform does not expose a manifesting/end-of-day concept via its REST API.',
    },
    {
      resource: 'order',
      reason:
        'Skydropx API (docs.skydropx.com) has no order endpoint; orders are referenced only as optional attributes on shipments, not as a standalone resource.',
    },
    {
      resource: 'warehouse',
      reason:
        'Skydropx API (docs.skydropx.com) has no warehouse endpoint; the platform does not expose warehouse/fulfillment-center management via its REST API.',
    },
  ],
} as const
