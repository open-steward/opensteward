export const metadata = {
  platform: 'flexport',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'order',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'Flexport has no manifest endpoint in either the v2 API (api.flexport.com/v2) or the Logistics API (logistics-api.flexport.com/2025-03); confirmed by reviewing all resource tags in the official docs',
    },
  ],
} as const
