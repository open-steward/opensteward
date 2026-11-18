export const metadata = {
  platform: 'wise-systems',
  totalResources: 8,
  availableResources: [
    'order',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Wise Systems is an autonomous dispatch/routing platform with no carrier configuration API',
    },
    {
      resource: 'label',
      reason: 'No shipping label generation endpoints exist in the Wise Systems API',
    },
    {
      resource: 'manifest',
      reason: 'No manifest endpoints exist in the Wise Systems API',
    },
    {
      resource: 'rate',
      reason: 'No rate/quote calculation endpoints exist in the Wise Systems API',
    },
  ],
} as const
