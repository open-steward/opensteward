export const metadata = {
  platform: 'bluejay',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed',
    },
  ],
} as const
