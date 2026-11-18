export const metadata = {
  platform: 'vizion',
  totalResources: 8,
  availableResources: ['carrier', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'label', reason: 'Vizion is a container-tracking API only; no parcel label generation endpoint exists' },
    { resource: 'manifest', reason: 'No manifest concept or endpoint in Vizion API' },
    { resource: 'order', reason: 'No order management in Vizion API' },
    { resource: 'rate', reason: 'No rating or quoting in Vizion API' },
    { resource: 'warehouse', reason: 'No warehouse management in Vizion API' },
  ],
} as const
