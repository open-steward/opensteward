export const metadata = {
  platform: 'packeta',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'manifest', reason: 'Packeta API has no manifest creation or listing endpoint' },
    { resource: 'order', reason: 'Packeta API has no order management endpoint' },
    { resource: 'rate', reason: 'Packeta uses a fixed published tariff; no real-time rate quote API exists' },
    { resource: 'warehouse', reason: 'Packeta API has no warehouse listing endpoint' },
  ],
} as const
