export const metadata = {
  platform: 'networkon',
  totalResources: 8,
  availableResources: ['order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: NetworkON API docs are not publicly accessible; no confirmed /carriers endpoint found in any public source',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: NetworkON API docs are not publicly accessible; no confirmed /labels endpoint found in any public source',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: NetworkON API docs are not publicly accessible; no confirmed /manifests endpoint found in any public source',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: NetworkON API docs are not publicly accessible; no confirmed /rates endpoint found in any public source',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: NetworkON API docs are not publicly accessible; no confirmed /warehouses endpoint found in any public source',
    },
  ],
} as const
