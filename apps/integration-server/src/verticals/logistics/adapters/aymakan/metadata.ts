export const metadata = {
  platform: 'aymakan',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label', 'warehouse'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Aymakan is a single-carrier platform; no carrier list endpoint exists in API v2',
    },
    {
      resource: 'manifest',
      reason: 'No manifest concept or endpoint in Aymakan API v2',
    },
    {
      resource: 'order',
      reason: 'Aymakan manages shipments only; no order management concept or endpoint exists',
    },
    {
      resource: 'rate',
      reason:
        'No rate/quote endpoint: the official aymakan/python-sdk on GitHub documents no such ' +
        'method, and the third-party shipflow unified SDK explicitly marks Aymakan rate ' +
        'support unsupported. getRates was removed from index.ts to match.',
    },
  ],
} as const
