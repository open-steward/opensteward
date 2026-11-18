export const metadata = {
  platform: 'borzo',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Borzo is a single-carrier last-mile platform; no carrier management endpoints exist in the API',
    },
    {
      resource: 'warehouse',
      reason: 'Borzo has no warehouse or fulfillment-centre endpoints',
    },
    {
      resource: 'manifest',
      reason: 'Borzo has no manifest/end-of-day closeout endpoints',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: GET /labels endpoint is listed in the API table of contents but the response schema (field names) could not be confirmed from publicly accessible docs',
    },
  ],
} as const
