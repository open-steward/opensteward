export const metadata = {
  platform: 'ontrac',
  totalResources: 8,
  availableResources: ['carrier', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'label', reason: 'UNVERIFIED: OnTrac v2 REST API docs are private/gated; label endpoint path and response shape could not be confirmed' },
    { resource: 'manifest', reason: 'Manifests are not required by OnTrac (confirmed via EasyPost carrier guide)' },
    { resource: 'order', reason: 'OnTrac is a carrier only; no order-management API exists' },
    { resource: 'rate', reason: 'UNVERIFIED: OnTrac v2 REST API docs are private/gated; rate endpoint path and response shape could not be confirmed' },
    { resource: 'warehouse', reason: 'OnTrac has no warehouse/fulfillment-location resource in its API' },
  ],
} as const
