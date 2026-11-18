export const metadata = {
  platform: 'sameday',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'Sameday has no manifest concept in its REST API; the official PHP SDK (20 methods) exposes only AWB, parcel, pickup-point, service, geo-data, and status-sync operations — no manifest creation or management endpoint exists.',
    },
    {
      resource: 'order',
      reason:
        'Sameday is a carrier API only; it has no order management layer. AWBs (shipments) are created directly — there is no order resource or endpoint in the official SDK or REST API.',
    },
  ],
} as const
