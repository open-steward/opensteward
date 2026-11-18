export const metadata = {
  platform: 'parcelhub',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'label'],
  unavailableResources: [
    { resource: 'carrier', reason: 'UNVERIFIED: GET /1.0/ServiceProviders exists in the v1 public docs but the v3 endpoint path and response shape are not publicly accessible' },
    { resource: 'manifest', reason: 'No manifest endpoint in the Parcelhub Shipping API (sections: Services, Shipment, Service Providers, Draft Shipments, Preference Lists, Store Locator)' },
    { resource: 'order', reason: 'Parcelhub is a carrier label/dispatch platform with no order management API' },
    { resource: 'warehouse', reason: 'No warehouse endpoint in the Parcelhub API' },
  ],
} as const
