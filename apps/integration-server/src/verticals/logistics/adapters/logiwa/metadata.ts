export const metadata = {
  platform: 'logiwa',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'order',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'warehouse',
      reason:
        'No /Warehouse list or detail endpoint exists in the Logiwa v3.1 REST API spec; only warehouse location helper lookup endpoints (location types, zones, groups) are available.',
    },
  ],
} as const
