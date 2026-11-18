export const metadata = {
  platform: 'lalamove',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Lalamove is a single-carrier platform; no carrier listing API exists in the v3 REST API' },
    { resource: 'label', reason: 'Lalamove does not issue shipping labels; no label endpoint exists in the v3 REST API' },
    { resource: 'manifest', reason: 'No manifest API exists in the Lalamove v3 REST API' },
    { resource: 'warehouse', reason: 'No warehouse API exists in the Lalamove v3 REST API' },
  ],
} as const
