export const metadata = {
  platform: 'project44',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'rate', 'shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    {
      resource: 'label',
      reason: 'project44 has no parcel label (PDF/PNG/ZPL) API; the Electronic BOL endpoint produces a carrier bill-of-lading document, not a shipping label',
    },
    {
      resource: 'manifest',
      reason: 'no manifest endpoint exists in the project44 v4 REST API',
    },
  ],
} as const
