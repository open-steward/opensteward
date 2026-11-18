export const metadata = {
  platform: 'ghn',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'order',
    'warehouse',
    'carrier',
    'label',
    'rate',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'GHN has no public manifest/handover API endpoint; manifests are managed in-app only',
    },
  ],
} as const
