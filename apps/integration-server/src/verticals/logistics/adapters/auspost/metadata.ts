export const metadata = {
  platform: 'auspost',
  totalResources: 8,
  availableResources: ['label', 'manifest', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'AusPost is a single carrier; the API has no carrier-configuration endpoint',
    },
    {
      resource: 'warehouse',
      reason: 'AusPost has no warehouse or facility management API',
    },
  ],
} as const
