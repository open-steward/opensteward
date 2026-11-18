export const metadata = {
  platform: 'shiptheory',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'manifest', reason: 'Shiptheory API has no manifest endpoints; the API covers shipment booking, returns, services, and packages only.' },
    { resource: 'order', reason: 'Shiptheory API has no order management endpoints; orders are managed externally and pushed as shipments.' },
    { resource: 'warehouse', reason: 'Shiptheory API has no warehouse endpoints; warehouse configuration is done through the dashboard UI only.' },
  ],
} as const
