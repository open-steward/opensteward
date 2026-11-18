export const metadata = {
  platform: 'ghtk',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'order',
    'rate',
    'warehouse',
    'label',
  ],
  unavailableResources: [
    { resource: 'carrier', reason: 'GHTK is itself the sole carrier; no carrier-list endpoint exists in the API' },
    { resource: 'manifest', reason: 'No manifest endpoint exists in the GHTK API' },
  ],
} as const
