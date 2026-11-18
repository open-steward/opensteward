export const metadata = {
  platform: 'shipmondo',
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
      reason: 'Shipmondo API v3 has no warehouse concept or endpoint',
    },
  ],
} as const
