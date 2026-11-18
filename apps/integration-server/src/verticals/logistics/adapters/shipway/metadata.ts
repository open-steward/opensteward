export const metadata = {
  platform: 'shipway',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'label', reason: 'Shipway is a post-purchase tracking aggregator; no label generation endpoint exists in its public API' },
    { resource: 'manifest', reason: 'No manifest endpoint in Shipway API; platform does not support carrier end-of-day manifests' },
    { resource: 'warehouse', reason: 'No warehouse management endpoint in Shipway API; platform is a tracking aggregator, not a WMS' },
  ],
} as const
