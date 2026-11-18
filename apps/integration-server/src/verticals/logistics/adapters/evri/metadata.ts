export const metadata = {
  platform: 'evri',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Evri is a single carrier; no /carriers listing endpoint exists in their API' },
    { resource: 'manifest', reason: 'Manifesting is not supported or required by Evri (confirmed via EasyPost and ShipEngine documentation)' },
    { resource: 'order', reason: 'Evri API has no orders concept or endpoint' },
    { resource: 'rate', reason: 'Evri does not expose rate quotes via API (confirmed via ShipEngine documentation)' },
    { resource: 'warehouse', reason: 'Evri API has no warehouse management endpoints' },
  ],
} as const
