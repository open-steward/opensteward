export const metadata = {
  platform: 'grab-express',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Grab Express is a single carrier; no carrier-listing endpoint exists in the API' },
    { resource: 'label', reason: 'No label download endpoint; the API returns a trackingURL (web link) but no PDF/ZPL/PNG label resource' },
    { resource: 'manifest', reason: 'No manifest or shipment-consolidation concept in the Grab Express API' },
    { resource: 'warehouse', reason: 'No warehouse or hub-management endpoint in the Grab Express API' },
  ],
} as const
