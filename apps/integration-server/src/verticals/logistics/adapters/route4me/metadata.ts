export const metadata = {
  platform: 'route4me',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Route4Me is a route-optimization platform, not a carrier; no carrier management API exists' },
    { resource: 'label', reason: 'Route4Me does not generate shipping labels; no label endpoint exists' },
    { resource: 'manifest', reason: 'Route4Me has no manifest concept or endpoint' },
    { resource: 'rate', reason: 'Route4Me is not a carrier rating service; no rate/quote endpoint exists' },
  ],
} as const
