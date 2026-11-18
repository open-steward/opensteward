export const metadata = {
  platform: '17track',
  totalResources: 8,
  availableResources: ['trackingevent', 'shipment', 'carrier'],
  unavailableResources: [
    { resource: 'label', reason: '17TRACK is a pure parcel-tracking API; it has no label generation or retrieval endpoints' },
    { resource: 'manifest', reason: '17TRACK has no manifest or end-of-day close-out concept in its API' },
    { resource: 'order', reason: '17TRACK has no order management endpoints' },
    { resource: 'rate', reason: '17TRACK has no rate-shopping or rate-quote endpoints' },
    { resource: 'warehouse', reason: '17TRACK has no warehouse management endpoints' },
  ],
} as const
