export const metadata = {
  platform: 'dhl-parcel-de',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label', 'manifest'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Single-carrier API — DHL Parcel DE exposes no carrier listing endpoint; the carrier is always DHL itself',
    },
    {
      resource: 'order',
      reason: 'The /orders endpoint in this API is a label-creation endpoint, not an order management resource; the concept maps entirely to shipments',
    },
    {
      resource: 'rate',
      reason: 'The DHL Parcel DE Shipping API has no rate-shopping or pricing endpoint',
    },
    {
      resource: 'warehouse',
      reason: 'The DHL Parcel DE Shipping API has no warehouse management endpoint',
    },
  ],
} as const
