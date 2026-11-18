export const metadata = {
  platform: 'aramex',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Aramex is itself a single carrier; no API endpoint exists to list carriers' },
    { resource: 'manifest', reason: 'No CreateManifest or closeout endpoint exists in the Aramex public API (WSDL defines only CreateShipments, PrintLabel, CreatePickup, CancelPickup)' },
    { resource: 'order', reason: 'Aramex has no order management API; the platform covers shipping, tracking, and rate calculation only' },
    { resource: 'warehouse', reason: 'Aramex has no warehouse management API despite offering warehousing as a physical service' },
  ],
} as const
