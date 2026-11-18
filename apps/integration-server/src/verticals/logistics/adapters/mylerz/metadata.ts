export const metadata = {
  platform: 'mylerz',
  totalResources: 8,
  availableResources: [
    'trackingevent',
    'shipment',
    'order',
    'warehouse',
    'label',
    'rate',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Mylerz is a single self-contained carrier with no /carriers listing endpoint; the API (v1.3.1) has no carrier resource.',
    },
    {
      resource: 'manifest',
      reason: 'The Mylerz API (v1.3.1) has no manifest or pickup-manifest management endpoint.',
    },
  ],
} as const
