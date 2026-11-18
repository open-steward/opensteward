export const metadata = {
  platform: 'transplace',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: Transplace/Uber Freight publishes no public REST API documentation; developer.transplace.com is unreachable and no OpenAPI spec is available. Cannot confirm a /carriers endpoint exists without fabricating it.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Transplace is an enterprise freight TMS (LTL/FTL), not a parcel carrier. Parcel-style shipping labels (ZPL/PDF) are unlikely to be a first-class resource, but no public API docs are accessible to confirm either way.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Transplace/Uber Freight publishes no public REST API documentation; cannot confirm a manifest/SCAN-form endpoint exists. Enterprise TMS manifests differ from parcel manifests and may not map to this schema.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: Transplace is known to offer freight rate procurement functionality, but no public REST API documentation is accessible to confirm endpoint paths or response field names.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: Transplace/Uber Freight publishes no public REST API documentation; developer.transplace.com is unreachable and no OpenAPI spec is available. Cannot confirm a /warehouses endpoint exists without fabricating it.',
    },
  ],
} as const
