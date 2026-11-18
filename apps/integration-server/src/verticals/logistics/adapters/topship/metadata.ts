export const metadata = {
  platform: 'topship',
  totalResources: 8,
  availableResources: ['label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'Topship exposes no carrier listing endpoint; rates come from /get-shipment-rate as pricing tiers (Budget, Express, Premium), not carrier objects. Probe of /api/get-carriers returned HTTP 404.',
    },
    {
      resource: 'manifest',
      reason:
        'Topship has no manifest concept in its public API. Probe of /api/get-manifests returned HTTP 404 and no manifest endpoints appear in any documented reference.',
    },
    {
      resource: 'order',
      reason:
        'Topship is shipment-centric and has no order management endpoint. Probe of /api/get-orders returned HTTP 404; no orders resource is referenced in the API documentation.',
    },
    {
      resource: 'warehouse',
      reason:
        'Topship has no warehouse management API. Probe of /api/get-warehouses returned HTTP 404; the platform has drop-off/pickup points but no warehouse resource exposed via API.',
    },
  ],
} as const
