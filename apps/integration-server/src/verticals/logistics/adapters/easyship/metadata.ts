export const metadata = {
  platform: 'easyship',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'rate',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'order',
      reason: 'Easyship has no /orders endpoint — the platform is shipment-centric; orders are managed externally and passed in as shipment requests.',
    },
    {
      resource: 'warehouse',
      reason: 'Easyship has no GET /warehouses endpoint; warehouse integration is limited to eFulfillment state updates on shipments (POST /efulfillment/warehouse_state_update).',
    },
  ],
} as const
