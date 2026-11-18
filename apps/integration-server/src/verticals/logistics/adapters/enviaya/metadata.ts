export const metadata = {
  platform: 'enviaya',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'manifest', reason: 'EnviaYa has no manifest endpoint; it is a carrier-aggregator, not a WMS' },
    { resource: 'order', reason: 'EnviaYa has no orders API; shipments are booked directly without an order layer' },
    { resource: 'warehouse', reason: 'EnviaYa has no warehouse endpoint; it is a carrier-aggregator and does not manage warehouse locations' },
  ],
} as const
