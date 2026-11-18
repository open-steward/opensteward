export const metadata = {
  platform: 'smsa',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'SMSA is itself the single carrier; no carrier-list endpoint exists in the API' },
    { resource: 'manifest', reason: 'No manifest endpoint documented in the SMSA API' },
    { resource: 'order', reason: 'SMSA is a carrier, not an OMS; no order management endpoint exists' },
    { resource: 'warehouse', reason: 'SMSA is a carrier, not a WMS; no warehouse endpoint exists' },
  ],
} as const
