export const metadata = {
  platform: 'rplust',
  totalResources: 8,
  availableResources: ['rate', 'trackingevent', 'shipment', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'R+L Carriers is a single LTL carrier; the API exposes no carrier listing or definition endpoint',
    },
    {
      resource: 'manifest',
      reason: 'No manifest management endpoint exists in the R+L Carriers API',
    },
    {
      resource: 'order',
      reason: 'No order lifecycle concept in the R+L Carriers API; BOL/pickup is the nearest analogue but lacks order-level status management',
    },
    {
      resource: 'warehouse',
      reason: 'Service Points API returns only City/State/ZIP for service centers; no warehouse management concept exposed',
    },
  ],
} as const
