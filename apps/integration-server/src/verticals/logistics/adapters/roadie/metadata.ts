export const metadata = {
  platform: 'roadie',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Roadie is a single on-demand courier; no /v1/carriers endpoint exists in the API' },
    { resource: 'manifest', reason: 'No manifest concept or endpoint in the Roadie API' },
    { resource: 'order', reason: 'Roadie has no separate order resource; shipments serve that role' },
    { resource: 'warehouse', reason: 'Roadie is an on-demand delivery network, not a WMS; no warehouse endpoints' },
  ],
} as const
