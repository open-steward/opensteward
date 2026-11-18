export const metadata = {
  platform: 'pickrr',
  totalResources: 8,
  availableResources: ['order', 'rate', 'shipment', 'trackingevent', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'No dedicated carrier-listing endpoint; carriers are embedded in pricing/rate responses and require origin+destination pincodes to enumerate',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: docs.pickrr.com SPA returns only loading screens; no manifest endpoint found in any public source or third-party integration docs',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: docs.pickrr.com SPA returns only loading screens; Pickrr is a courier aggregator with no confirmed public warehouse-listing endpoint',
    },
  ],
} as const
