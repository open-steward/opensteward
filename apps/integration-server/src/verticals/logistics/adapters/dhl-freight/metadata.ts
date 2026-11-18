export const metadata = {
  platform: 'dhl-freight',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'order',
    'rate',
    'label',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'DHL Freight is the carrier itself; the API provides no carrier-listing endpoint',
    },
    {
      resource: 'manifest',
      reason: 'DHL Freight Road API exposes no manifest or end-of-day consolidation endpoint',
    },
    {
      resource: 'warehouse',
      reason: 'DHL Freight API exposes no warehouse management endpoints',
    },
  ],
} as const
