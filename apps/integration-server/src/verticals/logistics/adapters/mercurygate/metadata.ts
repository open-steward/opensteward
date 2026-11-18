export const metadata = {
  platform: 'mercurygate',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'UNVERIFIED: MercuryGate REST API docs are behind a partner/login portal; mercurygate.com now redirects to infios.com after acquisition. No public evidence of a /labels endpoint was found.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: MercuryGate REST API docs are behind a partner/login portal; mercurygate.com now redirects to infios.com after acquisition. No public evidence of a /manifests endpoint was found.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: MercuryGate REST API docs are behind a partner/login portal; mercurygate.com now redirects to infios.com after acquisition. No public evidence of a /warehouses endpoint was found.',
    },
  ],
} as const
