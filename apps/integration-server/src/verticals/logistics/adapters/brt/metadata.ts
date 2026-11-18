export const metadata = {
  platform: 'brt',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'BRT is a single-carrier platform; no /carriers listing endpoint exists in the BRT REST API',
    },
    {
      resource: 'order',
      reason: 'BRT is a parcel/carrier API with no order-management concept or endpoint',
    },
    {
      resource: 'warehouse',
      reason: 'BRT\'s public API exposes no warehouse management endpoints',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: BRT developer portal (brt.it/developer) returned HTTP 403; no public rate-quoting endpoint could be confirmed',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: BRT developer portal returned HTTP 403; no public manifest endpoint could be confirmed',
    },
  ],
} as const
