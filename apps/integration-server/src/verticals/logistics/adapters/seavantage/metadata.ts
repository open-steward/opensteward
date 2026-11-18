export const metadata = {
  platform: 'seavantage',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'SeaVantage is a pure ocean visibility platform; its API exposes only cargo/search and fleet/ship/info — no carrier management endpoint exists.',
    },
    {
      resource: 'label',
      reason:
        'SeaVantage does not offer label creation or retrieval; the API has no label endpoint.',
    },
    {
      resource: 'manifest',
      reason:
        'SeaVantage does not offer manifest management; the API has no manifest endpoint.',
    },
    {
      resource: 'order',
      reason:
        'SeaVantage does not offer order management; the API has no order endpoint.',
    },
    {
      resource: 'rate',
      reason:
        'SeaVantage does not offer freight rate quoting; the API has no rate endpoint.',
    },
    {
      resource: 'warehouse',
      reason:
        'SeaVantage does not offer warehouse management; the API has no warehouse endpoint.',
    },
  ],
} as const
