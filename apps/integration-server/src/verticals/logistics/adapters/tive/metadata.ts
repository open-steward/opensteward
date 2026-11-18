export const metadata = {
  platform: 'tive',
  totalResources: 8,
  availableResources: ['carrier', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'label', reason: 'Tive is a visibility/IoT-tracker platform; no label generation or management endpoints exist in Tive API v3' },
    { resource: 'manifest', reason: 'No manifest endpoint in Tive API v3; platform does not support carrier manifest workflows' },
    { resource: 'order', reason: 'No order management endpoints in Tive API v3; platform focuses on shipment tracking, not order fulfillment' },
    { resource: 'rate', reason: 'No rate-quoting endpoints in Tive API v3; platform does not provide shipping rate calculation' },
    { resource: 'warehouse', reason: 'No warehouse endpoints in Tive API v3; platform does not model warehouse locations' },
  ],
} as const
