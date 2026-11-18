export const metadata = {
  platform: 'optimoroute',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'OptimoRoute is a route-optimisation platform with no carrier accounts or registry endpoint' },
    { resource: 'label', reason: 'OptimoRoute does not generate shipping labels; no label endpoint exists in the API' },
    { resource: 'manifest', reason: 'No manifest concept or endpoint in the OptimoRoute API' },
    { resource: 'rate', reason: 'OptimoRoute does not calculate shipping rates; no rate endpoint exists in the API' },
    { resource: 'warehouse', reason: 'No warehouse/depot management endpoint in the OptimoRoute API' },
  ],
} as const
