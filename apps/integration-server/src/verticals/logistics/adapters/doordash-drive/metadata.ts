export const metadata = {
  platform: 'doordash-drive',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'DoorDash Drive has no carrier management API; DoorDash itself is the sole carrier' },
    { resource: 'label', reason: 'DoorDash Drive dispatches Dashers and does not generate shipping labels' },
    { resource: 'manifest', reason: 'Manifesting is not supported or required for DoorDash Drive (confirmed by EasyPost integration docs)' },
    { resource: 'warehouse', reason: 'DoorDash Drive has no warehouse management API' },
  ],
} as const
