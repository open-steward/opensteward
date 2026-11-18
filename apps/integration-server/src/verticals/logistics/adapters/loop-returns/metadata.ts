export const metadata = {
  platform: 'loop-returns',
  totalResources: 8,
  availableResources: [
    'trackingevent',
    'shipment',
    'order',
    'label',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Loop Returns has no dedicated carrier list endpoint; carrier info is embedded in return records only',
    },
    {
      resource: 'manifest',
      reason: 'Loop Returns has no manifest API endpoint',
    },
    {
      resource: 'rate',
      reason: 'Loop Returns handles rate shopping internally when generating return labels; no rate-query API is exposed to integrators',
    },
  ],
} as const
