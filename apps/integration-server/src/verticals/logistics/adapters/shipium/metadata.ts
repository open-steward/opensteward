export const metadata = {
  platform: 'shipium',
  totalResources: 8,
  availableResources: [
    'label',
    'manifest',
    'order',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Shipium has no REST endpoint to list or retrieve carriers; the carrier catalog is static configuration documented in the Supported Carriers page, not queryable via API.',
    },
  ],
} as const
