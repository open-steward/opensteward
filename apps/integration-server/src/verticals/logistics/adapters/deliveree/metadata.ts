export const metadata = {
  platform: 'deliveree',
  totalResources: 8,
  availableResources: ['carrier', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'label', reason: 'Deliveree is an on-demand delivery platform with no label printing concept or endpoint' },
    { resource: 'manifest', reason: 'No manifest endpoint exists in the Deliveree API' },
    { resource: 'order', reason: 'No order management concept; Deliveree only exposes delivery bookings (use shipments)' },
    { resource: 'warehouse', reason: 'No warehouse endpoint exists in the Deliveree API' },
  ],
} as const
