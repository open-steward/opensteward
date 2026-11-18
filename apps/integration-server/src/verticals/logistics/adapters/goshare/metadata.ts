export const metadata = {
  platform: 'goshare',
  totalResources: 8,
  availableResources: ['trackingevent', 'shipment', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'GoShare is a single-carrier dispatch platform; no carrier listing endpoint exists in the API' },
    { resource: 'label', reason: 'GoShare is a courier-dispatch service, not a label-printing platform; no label endpoint exists' },
    { resource: 'manifest', reason: 'No manifest concept or endpoint in the GoShare API' },
    { resource: 'warehouse', reason: 'No warehouse endpoint in the GoShare API' },
    { resource: 'rate', reason: 'UNVERIFIED: /v1/projects/estimate endpoint confirmed but response field names require auth-gated docs; cannot safely map without verified schema' },
  ],
} as const
