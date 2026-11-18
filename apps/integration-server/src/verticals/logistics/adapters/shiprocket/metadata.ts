export const metadata = {
  platform: 'shiprocket',
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
