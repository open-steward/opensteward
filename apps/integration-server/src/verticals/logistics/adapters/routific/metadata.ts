export const metadata = {
  platform: 'routific',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Routific is a route-optimization platform with no carrier/shipping-carrier concept or API endpoints' },
    { resource: 'label', reason: 'Routific has no shipping label creation or retrieval endpoints' },
    { resource: 'manifest', reason: 'Routific has no manifest endpoints; route printing is only available via the web UI' },
    { resource: 'rate', reason: 'Routific has no rate-shopping or rate-retrieval endpoints' },
    { resource: 'warehouse', reason: 'Routific has no warehouse management endpoints' },
  ],
} as const
