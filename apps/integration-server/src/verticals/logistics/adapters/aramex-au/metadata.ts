export const metadata = {
  platform: 'aramex-au',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'No carrier-listing endpoint exists; GET /api/consignment-services lists service surcharge types, not carrier entities.',
    },
    {
      resource: 'label',
      reason:
        'GET /api/consignments/{id}/labels returns a binary PDF byte array, not a structured JSON label object with id/status/url fields.',
    },
    {
      resource: 'manifest',
      reason: 'No manifest endpoint exists in the myFastway (Aramex AU) API.',
    },
    {
      resource: 'order',
      reason: 'No orders endpoint exists in the myFastway (Aramex AU) API.',
    },
    {
      resource: 'warehouse',
      reason:
        'No warehouse/facility-listing endpoint exists; POST /api/location is a routing lookup, not a warehouse list.',
    },
  ],
} as const
