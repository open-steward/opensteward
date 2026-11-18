export const metadata = {
  platform: 'vizion-api',
  totalResources: 8,
  availableResources: ['carrier', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'Vizion is a container-tracking-only API; it has no label creation, retrieval, or management endpoints.',
    },
    {
      resource: 'manifest',
      reason:
        'Vizion is a container-tracking-only API; it has no manifest endpoints.',
    },
    {
      resource: 'order',
      reason:
        'Vizion is a container-tracking-only API; it has no order management endpoints.',
    },
    {
      resource: 'rate',
      reason:
        'Vizion is a container-tracking-only API; it has no rate-quoting endpoints.',
    },
    {
      resource: 'warehouse',
      reason:
        'Vizion is a container-tracking-only API; it has no warehouse management endpoints.',
    },
  ],
} as const
