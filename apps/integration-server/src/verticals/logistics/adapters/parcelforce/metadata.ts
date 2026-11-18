export const metadata = {
  platform: 'parcelforce',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: SOAP API has createManifest but no confirmed REST endpoint at api.parcelforce.net/v1/manifests is publicly documented',
    },
    {
      resource: 'order',
      reason: 'Parcelforce is a carrier-only service with no order management concept or endpoint',
    },
    {
      resource: 'rate',
      reason: 'Parcelforce does not expose estimated rates via its API (confirmed by ShipEngine documentation)',
    },
    {
      resource: 'warehouse',
      reason: 'Parcelforce has no warehouse management concept or endpoint',
    },
  ],
} as const
