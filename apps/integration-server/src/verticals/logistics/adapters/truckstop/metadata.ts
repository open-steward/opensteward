export const metadata = {
  platform: 'truckstop',
  totalResources: 8,
  availableResources: ['carrier', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'Truckstop is a freight load board and carrier matching platform, not a parcel carrier. It has no shipping label generation API.',
    },
    {
      resource: 'manifest',
      reason:
        'No manifest API exists; the parcel-manifest concept does not apply to freight brokerage. The Document API covers freight docs (BOL, rate confirmations) not carrier manifests.',
    },
    {
      resource: 'order',
      reason:
        'Truckstop has no order management concept separate from loads. Loads (shipments) are the core entity; there is no dedicated order resource in the API.',
    },
    {
      resource: 'warehouse',
      reason:
        'Truckstop has no warehouse management API. The platform manages freight loads and carrier matching, not warehouse inventory or facility operations.',
    },
  ],
} as const
