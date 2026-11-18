export const metadata = {
  platform: 'senpex',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Senpex is a single-carrier courier service; the API exposes no carrier listing endpoint.',
    },
    {
      resource: 'label',
      reason: 'Senpex operates as a courier dispatch platform; no shipping label generation endpoint exists in the API.',
    },
    {
      resource: 'manifest',
      reason: 'No manifest or scan-form endpoint is documented or available in the Senpex API v4.',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse management endpoint is documented or available in the Senpex API v4.',
    },
  ],
} as const
