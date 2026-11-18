export const metadata = {
  platform: 'cdek',
  totalResources: 8,
  availableResources: [
    'label',
    'order',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'CDEK is the sole carrier; no multi-carrier carrier list endpoint exists in the v2 API.',
    },
    {
      resource: 'manifest',
      reason: 'No manifest endpoint is available in the public CDEK v2 API.',
    },
  ],
} as const
