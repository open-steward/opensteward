export const metadata = {
  platform: 'tookan',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Tookan is a last-mile dispatch platform; carrier (UPS, FedEx, etc.) is not a Tookan concept and no carrier endpoint exists' },
    { resource: 'label', reason: 'Tookan does not generate shipping labels; no label creation or retrieval endpoint exists in the API' },
    { resource: 'manifest', reason: 'Tookan has no manifest concept or endpoint' },
    { resource: 'rate', reason: 'Tookan has no rate-quoting or pricing endpoint; it is a task dispatch system, not a shipping rate engine' },
    { resource: 'warehouse', reason: 'Tookan has no warehouse endpoint; geofences exist as a UI concept but are not exposed via the public API' },
  ],
} as const
