export const metadata = {
  platform: 'bpost',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'bpost Shipping Manager API has no manifest/end-of-day closeout endpoint',
    },
    {
      resource: 'warehouse',
      reason: 'bpost API has no warehouse or depot management endpoint',
    },
  ],
} as const
