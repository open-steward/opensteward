export const metadata = {
  platform: 'starshipit',
  totalResources: 8,
  availableResources: ['label', 'manifest', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'warehouse',
      reason:
        'Starshipit has no warehouse/location resource in its REST API. Multi-origin is handled by embedding a sender address in each rates/order request or by using separate API tokens per account — no dedicated warehouses endpoint exists.',
    },
    {
      resource: 'carrier',
      reason:
        'Its API reference has no carrier or carrier-account collection, only the static "Carrier Enums" table',
    },
  ],
} as const
