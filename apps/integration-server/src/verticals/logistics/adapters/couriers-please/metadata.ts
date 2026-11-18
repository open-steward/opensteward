export const metadata = {
  platform: 'couriers-please',
  totalResources: 8,
  availableResources: ['label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Couriers Please is a single-carrier service with no carrier-listing API endpoint; the platform itself is the only carrier.',
    },
    {
      resource: 'manifest',
      reason:
        'Manifesting is not supported or required by Couriers Please — confirmed by ShipEngine and EasyPost official documentation.',
    },
    {
      resource: 'order',
      reason:
        'Couriers Please has no order management concept or orders API endpoint; the platform only handles consignments/shipments.',
    },
    {
      resource: 'warehouse',
      reason:
        'Couriers Please has no warehouse management concept or warehouses API endpoint.',
    },
  ],
} as const
