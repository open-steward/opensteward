export const metadata = {
  platform: 'magaya',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed',
    },
  ],
} as const
