export const metadata = {
  platform: 'singapore-post',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: API docs are behind login at developer.singpost.com; no public endpoint confirmed',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: API docs are behind login at developer.singpost.com; no public endpoint confirmed',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: API docs are behind login at developer.singpost.com; no public endpoint confirmed',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: API docs are behind login at developer.singpost.com; no public endpoint confirmed',
    },
  ],
} as const
