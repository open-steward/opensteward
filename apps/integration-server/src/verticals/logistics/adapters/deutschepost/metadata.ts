export const metadata = {
  platform: 'deutschepost',
  totalResources: 8,
  availableResources: ['label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Deutsche Post DPI v1 REST API has no /carriers endpoint; Deutsche Post is itself the sole carrier and exposes no carrier listing or lookup resource.',
    },
    {
      resource: 'manifest',
      reason:
        'Deutsche Post DPI v1 REST API has no /manifests endpoint; order finalization (POST /orders/{orderId}/finalize) produces AWB labels but not a manifest document.',
    },
    {
      resource: 'order',
      reason:
        'Deutsche Post DPI v1 REST API only exposes POST /orders (create) and POST /orders/{orderId}/finalize; there are no GET /orders or GET /orders/{orderId} endpoints for listing or retrieving orders.',
    },
    {
      resource: 'warehouse',
      reason:
        'Warehouse management is a separate DHL Supply Chain product with its own credentials and base URL; not available via the Deutsche Post DPI v1 REST API.',
    },
  ],
} as const
