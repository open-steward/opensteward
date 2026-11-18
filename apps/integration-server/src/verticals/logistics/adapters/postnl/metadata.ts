export const metadata = {
  platform: 'postnl',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'shipment',
    'trackingevent',
  ],
  unavailableResources: [
    {
      resource: 'order',
      reason: 'PostNL is a pure carrier API (labels + tracking); no order-management endpoint exists.',
    },
    {
      resource: 'rate',
      reason: 'No programmatic rates API; PostNL publishes rates as static PDFs only with no REST endpoint.',
    },
    {
      resource: 'warehouse',
      reason: "PostNL's Location webservice returns consumer pickup points, not sender warehouse or depot records.",
    },
  ],
} as const
