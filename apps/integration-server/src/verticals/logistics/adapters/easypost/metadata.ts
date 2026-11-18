export const metadata = {
  platform: 'easypost',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'order',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'warehouse',
      reason: 'EasyPost has no warehouse/fulfillment-location resource in its REST API',
    },
  ],
} as const
