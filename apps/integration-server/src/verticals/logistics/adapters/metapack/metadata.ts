export const metadata = {
  platform: 'metapack',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'order',
      reason:
        'Metapack has no /orders REST endpoint; the platform is consignment/carrier-centric and does not expose an Order resource via its public API.',
    },
  ],
} as const
