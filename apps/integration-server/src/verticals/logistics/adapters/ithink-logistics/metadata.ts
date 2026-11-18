export const metadata = {
  platform: 'ithink-logistics',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'order',
    'warehouse',
    'rate',
    'label',
    'manifest',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'No dedicated list-carriers endpoint exists; carrier names appear only as logistic_name embedded in rate and order responses.',
    },
  ],
} as const
