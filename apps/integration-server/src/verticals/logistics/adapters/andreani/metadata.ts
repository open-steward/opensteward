export const metadata = {
  platform: 'andreani',
  totalResources: 8,
  availableResources: [
    'rate',
    'shipment',
    'trackingevent',
    'order',
    'label',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Andreani is a single-carrier platform; the REST API exposes no carrier-list endpoint',
    },
    {
      resource: 'manifest',
      reason: 'No manifiestos endpoint exists in the Andreani REST API (confirmed via SDK research and developer docs)',
    },
  ],
} as const
