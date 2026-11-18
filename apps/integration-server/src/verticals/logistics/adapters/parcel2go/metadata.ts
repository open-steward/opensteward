export const metadata = {
  platform: 'parcel2go',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'order',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Parcel2Go Swagger/API docs are behind auth; no /manifest endpoint appears in any public documentation — the platform publicly documents only quotes, orders, order-lines, tracking, labels, couriers, and drop-shop geolocation.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Parcel2Go Swagger/API docs are behind auth; Parcel2Go is a parcel-comparison broker (not a WMS) and no warehouse endpoint appears in any public documentation or capability listing.',
    },
  ],
} as const
