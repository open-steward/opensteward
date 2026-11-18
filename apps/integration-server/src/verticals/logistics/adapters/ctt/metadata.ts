export const metadata = {
  platform: 'ctt',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'manifest', reason: 'CTT API has no manifest endpoint; confirmed absent from /v3/apidocs/usa/endpoints' },
    { resource: 'order', reason: 'CTT is a carrier-only API with no order management concept or endpoint' },
    { resource: 'warehouse', reason: 'CTT API has no warehouse endpoint; confirmed absent from /v3/apidocs/usa/endpoints' },
  ],
} as const
