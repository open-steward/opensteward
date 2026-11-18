export const metadata = {
  platform: 'track-pod',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Track-POD API only exposes Address, Route, Order, Driver, Test, and Vehicle resources — no carrier endpoint exists.',
    },
    {
      resource: 'label',
      reason:
        'Track-POD API only exposes Address, Route, Order, Driver, Test, and Vehicle resources — no label generation endpoint exists.',
    },
    {
      resource: 'manifest',
      reason:
        'Track-POD API only exposes Address, Route, Order, Driver, Test, and Vehicle resources — no manifest endpoint exists.',
    },
    {
      resource: 'rate',
      reason:
        'Track-POD API only exposes Address, Route, Order, Driver, Test, and Vehicle resources — no rate-quoting endpoint exists.',
    },
    {
      resource: 'warehouse',
      reason:
        'Track-POD API only exposes Address, Route, Order, Driver, Test, and Vehicle resources — no warehouse/depot list endpoint exists.',
    },
  ],
} as const
