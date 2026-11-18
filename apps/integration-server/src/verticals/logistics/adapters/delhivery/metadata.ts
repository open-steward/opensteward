export const metadata = {
  platform: 'delhivery',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'order',
    'warehouse',
    'rate',
    'label',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Delhivery is itself the sole carrier; no carrier listing or lookup endpoint exists in the public API.',
    },
    {
      resource: 'manifest',
      reason: 'Delhivery has no separate manifest resource; manifestation is the order-creation act (POST /api/cmu/create.json, named "Package Order Creation/Manifestation API").',
    },
  ],
} as const
