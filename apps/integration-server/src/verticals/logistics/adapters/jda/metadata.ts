export const metadata = {
  platform: 'jda',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: no public endpoint found; API docs are behind enterprise login at dev-jdapiportal.jdadelivers.com',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: no public endpoint found; API docs are behind enterprise login at dev-jdapiportal.jdadelivers.com',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: no public endpoint found; API docs are behind enterprise login at dev-jdapiportal.jdadelivers.com',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: no public endpoint found; API docs are behind enterprise login at dev-jdapiportal.jdadelivers.com',
    },
  ],
} as const
