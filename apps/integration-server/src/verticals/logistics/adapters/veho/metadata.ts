export const metadata = {
  platform: 'veho',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'order', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Veho is itself the sole carrier; no /carriers list endpoint exists in Veho API v2' },
    { resource: 'manifest', reason: 'Manifesting is contractual/manual; no list or get manifest endpoint in Veho API v2' },
    { resource: 'warehouse', reason: 'No warehouse endpoints documented in Veho API v2' },
  ],
} as const
