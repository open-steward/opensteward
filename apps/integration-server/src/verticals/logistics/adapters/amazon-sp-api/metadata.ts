export const metadata = {
  platform: 'amazon-sp-api',
  totalResources: 8,
  availableResources: [
    'carrier',
    'label',
    'manifest',
    'order',
    'rate',
    'shipment',
    'trackingevent',
    'warehouse',
  ],
  unavailableResources: [] as { resource: string; reason: string }[],
} as const
