export const metadata = {
  platform: 'loggi',
  totalResources: 8,
  availableResources: ['label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Loggi is a single-carrier platform; no carrier management endpoint exists in the API (docs.api.loggi.com)',
    },
    {
      resource: 'manifest',
      reason: 'Loggi API has no manifest endpoint; manifests are not part of its documented surface (docs.api.loggi.com)',
    },
    {
      resource: 'order',
      reason: 'Loggi API has no order management endpoint; its scope is limited to shipments and tracking (docs.api.loggi.com)',
    },
    {
      resource: 'warehouse',
      reason: 'Loggi API has no warehouse endpoint; the platform does not expose warehouse or depot management (docs.api.loggi.com)',
    },
  ],
} as const
