export const metadata = {
  platform: 'shipmonk',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent', 'warehouse', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'ShipMonk has no carrier listing endpoint; carrier codes appear only as metadata on shipments and webhooks' },
    { resource: 'rate', reason: 'ShipMonk auto-selects shipping rates internally; no rate-quoting endpoint exists in the public API' },
    { resource: 'manifest', reason: 'ShipMonk has no manifest endpoint in its public API' },
  ],
} as const
