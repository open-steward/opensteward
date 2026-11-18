export const metadata = {
  platform: 'gocomet',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no carriers endpoint was found in documented or discoverable API paths — apidocs.gocomet.com requires login to access full spec',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no labels endpoint was found in documented or discoverable API paths — apidocs.gocomet.com requires login to access full spec',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no manifests endpoint was found in documented or discoverable API paths — apidocs.gocomet.com requires login to access full spec',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no orders endpoint was found in documented or discoverable API paths — apidocs.gocomet.com requires login to access full spec',
    },
    {
      resource: 'rate',
      reason:
        'UNVERIFIED: GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no rates endpoint was found in documented or discoverable API paths — apidocs.gocomet.com requires login to access full spec',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no warehouses endpoint was found in documented or discoverable API paths — apidocs.gocomet.com requires login to access full spec',
    },
  ],
} as const
