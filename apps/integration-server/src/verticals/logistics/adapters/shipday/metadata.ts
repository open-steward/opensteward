export const metadata = {
  platform: 'shipday',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason: 'Shipday is a last-mile dispatch platform with no label-generation API (confirmed via docs.shipday.com/llms.txt)',
    },
    {
      resource: 'manifest',
      reason: 'No manifest or SCAN-form concept exists in the Shipday API',
    },
    {
      resource: 'rate',
      reason: 'Shipday does not expose a rating or quoting endpoint',
    },
    {
      resource: 'warehouse',
      reason: 'Shipday has no warehouse management API',
    },
  ],
} as const
