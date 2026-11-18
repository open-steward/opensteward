export const metadata = {
  platform: 'ninja-van',
  totalResources: 8,
  availableResources: [
    'rate',
    'shipment',
    'trackingevent',
    'order',
    'label',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Ninja Van is itself the single carrier; no /carriers endpoint exists in the public API',
    },
    {
      resource: 'manifest',
      reason: 'No manifest or bulk-closeout endpoint exists in the public Ninja Van API',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse management endpoint exists in the public Ninja Van API',
    },
  ],
} as const
