export const metadata = {
  platform: 'kerry-express',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'order'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Kerry Express is a single-carrier network; no carrier-listing endpoint exists' },
    { resource: 'label', reason: 'UNVERIFIED: API portal (api.kerryexpress.com/v2) is inaccessible; Smart-EDI docs require authentication; no public JSON label record endpoint confirmed' },
    { resource: 'manifest', reason: 'UNVERIFIED: API portal inaccessible; no manifest endpoint confirmed in any accessible documentation' },
    { resource: 'warehouse', reason: 'UNVERIFIED: API portal inaccessible; no warehouse endpoint confirmed in any accessible documentation' },
  ],
} as const
