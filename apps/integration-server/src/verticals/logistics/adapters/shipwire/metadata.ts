export const metadata = {
  platform: 'shipwire',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'rate', 'trackingevent', 'warehouse'],
  unavailableResources: [
    {
      resource: 'shipment',
      reason:
        'No top-level /shipments endpoint exists in the Shipwire REST API; shipment data is nested under orders (/orders/:id/trackings) and receivings (/receivings/:id/shipments)',
    },
    {
      resource: 'label',
      reason:
        'Labels are generated per-order (/orders/:id/labels) with no independently listable or gettable label resource in the Shipwire REST API',
    },
    {
      resource: 'manifest',
      reason:
        'Manifests are not documented in the Shipwire REST API; no carrier manifest endpoint exists among the 11 documented API resources',
    },
  ],
} as const
