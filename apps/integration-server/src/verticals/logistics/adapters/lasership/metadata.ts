export const metadata = {
  platform: 'lasership',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: LaserShip v2 API docs are behind authentication; no publicly documented /v2/carriers or equivalent endpoint found.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: A label void/reprint endpoint exists in the v1 API (Pitney Bowes docs), but no equivalent /v2/labels endpoint is publicly documented for the v2 base URL this adapter uses.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: No manifest endpoint documented in any publicly accessible LaserShip API reference; EasyPost notes manifests are not required for LaserShip/OnTrac shipments.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: LaserShip does not expose a separate order resource in the v2 API; order placement is handled through shipment/package creation (already implemented as createShipment).',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: A rating endpoint exists in the v1 API (Pitney Bowes docs: POST /api/v1/rates), but no equivalent /v2/rates endpoint is publicly documented for the v2 base URL this adapter uses.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: No warehouse or facility listing endpoint documented in any publicly accessible LaserShip API reference.',
    },
  ],
} as const
