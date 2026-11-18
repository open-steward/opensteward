export const metadata = {
  platform: 'dayton-freight',
  totalResources: 8,
  availableResources: ['carrier', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Dayton Freight REST API is fully gated behind authentication; no public documentation confirms a Labels/ endpoint exists.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: No documented REST manifest endpoint found; LTL carriers do not typically expose parcel-style end-of-day manifests via their REST API.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: No documented REST order endpoint found; Dayton Freight is a regional LTL carrier with no order-management API surface.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: The legacy SOAP service exposes GetAllServiceCenterInformation but the REST API documentation is behind authentication and no public warehouse/service-center endpoint is confirmed.',
    },
  ],
} as const
