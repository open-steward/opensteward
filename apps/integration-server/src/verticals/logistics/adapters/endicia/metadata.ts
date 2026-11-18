export const metadata = {
  platform: 'endicia',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'manifest', 'rate', 'trackingevent'],
  unavailableResources: [
    { resource: 'order', reason: 'Endicia/SERA is a postage and label API; no order management endpoints exist' },
    { resource: 'shipment', reason: 'Endicia/SERA is a postage and label API; no shipment management endpoints exist' },
    { resource: 'warehouse', reason: 'Endicia/SERA is a postage and label API; no warehouse endpoints exist' },
  ],
} as const
