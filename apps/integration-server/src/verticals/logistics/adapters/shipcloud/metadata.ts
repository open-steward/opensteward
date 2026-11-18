export const metadata = {
  platform: 'shipcloud',
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
      reason: 'shipcloud API has no warehouse/fulfilment-centre concept; not present in v1 reference',
    },
  ],
} as const
