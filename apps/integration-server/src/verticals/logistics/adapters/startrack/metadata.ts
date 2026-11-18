export const metadata = {
  platform: 'startrack',
  totalResources: 8,
  availableResources: [
    'rate',
    'shipment',
    'trackingevent',
    'label',
    'manifest',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'StarTrack has no /carriers endpoint; it is itself the single carrier and the AusPost API provides no carrier listing concept',
    },
    {
      resource: 'order',
      reason: 'AusPost has no merchant-order resource; their "order" concept is the end-of-day manifest submission, not a fulfillment order',
    },
    {
      resource: 'warehouse',
      reason: 'No /warehouses endpoint exists in the Australia Post Shipping and Tracking API',
    },
  ],
} as const
