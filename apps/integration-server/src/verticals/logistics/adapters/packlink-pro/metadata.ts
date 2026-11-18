export const metadata = {
  platform: 'packlink-pro',
  totalResources: 8,
  availableResources: ['label', 'rate', 'shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'No manifest endpoint exists in the Packlink PRO public API; no evidence found in any official or community SDK',
    },
    {
      resource: 'order',
      reason:
        'Packlink PRO exposes only POST /v1/orders (create); no list or get order endpoints exist in the public API',
    },
    {
      resource: 'carrier',
      reason:
        "Its only services endpoint is a quote search, GET v1/services, which Packlink's own client refuses to call without 'Missing required search parameter(s).' (from/to country and zip, packages)",
    },
  ],
} as const
