export const metadata = {
  platform: 'apc-overnight',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'manifest', reason: 'APC Overnight does not require or support manifesting shipments (confirmed by ShipEngine docs)' },
    { resource: 'order', reason: 'APC Overnight is a carrier-only API with no order management concept' },
    { resource: 'warehouse', reason: 'No warehouse or pickup-point API exists in APC Overnight\'s platform' },
  ],
} as const
