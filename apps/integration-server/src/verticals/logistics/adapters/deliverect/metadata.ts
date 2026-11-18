export const metadata = {
  platform: 'deliverect',
  totalResources: 8,
  availableResources: ['order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Deliverect is an inbound push platform for food-delivery aggregation and does not expose carrier management endpoints.',
    },
    {
      resource: 'label',
      reason:
        'Deliverect does not issue or manage shipping labels; it is not a parcel-shipping platform.',
    },
    {
      resource: 'manifest',
      reason:
        'Deliverect does not produce carrier manifests; no such endpoint exists in the documented API.',
    },
    {
      resource: 'warehouse',
      reason:
        'Deliverect represents locations as channel-linked POS sites; no outbound REST endpoint for warehouse resources is documented.',
    },
  ],
} as const
