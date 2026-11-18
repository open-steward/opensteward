export const metadata = {
  platform: 'spee-dee',
  totalResources: 8,
  availableResources: ['carrier', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'label', reason: 'UNVERIFIED: api.speedeedelivery.com has no public documentation; label endpoint path and response shape cannot be confirmed' },
    { resource: 'manifest', reason: 'Spee-Dee does not expose a manifest API; only FTP manifesting available via direct carrier contact (manifest@speedeedelivery.com)' },
    { resource: 'order', reason: 'Spee-Dee is a carrier only; no order-management API exists' },
    { resource: 'rate', reason: 'UNVERIFIED: api.speedeedelivery.com has no public documentation; rate endpoint path and response shape cannot be confirmed' },
    { resource: 'warehouse', reason: 'Spee-Dee has no warehouse or fulfillment-location resource in its API' },
  ],
} as const
