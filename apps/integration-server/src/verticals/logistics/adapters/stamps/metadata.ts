export const metadata = {
  platform: 'stamps',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'manifest', 'rate', 'trackingevent'],
  unavailableResources: [
    { resource: 'order', reason: 'SERA has no order management concept; it is a label/shipping API only' },
    { resource: 'shipment', reason: 'SERA has no shipment records endpoint; labels are the equivalent resource' },
    { resource: 'warehouse', reason: 'SERA has no warehouse concept or endpoint' },
  ],
} as const
