export const metadata = {
  platform: 'aftership',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'order',
      reason:
        'AfterShip (Tracking and Shipping APIs) has no order management concept or /orders endpoint.',
    },
    {
      resource: 'warehouse',
      reason:
        'AfterShip APIs have no warehouse concept or /warehouses endpoint.',
    },
  ],
} as const
