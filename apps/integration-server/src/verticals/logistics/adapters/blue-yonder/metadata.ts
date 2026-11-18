export const metadata = {
  platform: 'blue-yonder',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'order', 'warehouse'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: no public endpoint found; API docs are behind enterprise login at developer-link.blueyonder.com',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: no public endpoint found; API docs are behind enterprise login at developer-link.blueyonder.com',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: no public endpoint found; API docs are behind enterprise login at developer-link.blueyonder.com',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: no public endpoint found; API docs are behind enterprise login at developer-link.blueyonder.com',
    },
  ],
} as const
