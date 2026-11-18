export const metadata = {
  platform: 'circuit',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Circuit is a route-optimisation platform with no carrier concept in its API' },
    { resource: 'label', reason: 'Circuit has no label printing or management resource' },
    { resource: 'manifest', reason: 'Circuit has no manifest resource' },
    { resource: 'order', reason: 'Circuit has no order resource; stops are delivery tasks, not commerce orders with line items or financials' },
    { resource: 'rate', reason: 'Circuit has no rate-shopping capability' },
  ],
} as const
