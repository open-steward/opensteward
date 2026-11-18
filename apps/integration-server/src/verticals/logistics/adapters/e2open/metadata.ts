export const metadata = {
  platform: 'e2open',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'e2open has no public /carriers list endpoint; carriers are configured within the TMS platform and are not exposed via the api.e2open.com/v1 REST API.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Label creation is part of the e2open Global Parcel product, which sits behind an authenticated proprietary portal separate from the api.e2open.com/v1 base URL used by this adapter; no public endpoint confirmed.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: Manifesting is part of the e2open Global Parcel product (authenticated proprietary portal), not available via the api.e2open.com/v1 REST API; no public endpoint confirmed.',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: e2open has TMS rating APIs (TM-Shippers Rating API, Real-Time Rating API) but they run on different base URLs and require separate carrier-side integration; no rate endpoint confirmed on api.e2open.com/v1.',
    },
    {
      resource: 'warehouse',
      reason:
        'e2open exposes no warehouse management REST endpoint in any documented public API; warehouse configuration is internal to the TMS platform.',
    },
  ],
} as const
