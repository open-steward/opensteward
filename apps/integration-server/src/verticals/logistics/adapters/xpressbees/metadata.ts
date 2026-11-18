export const metadata = {
  platform: 'xpressbees',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'rate',
    'carrier',
    'order',
    'label',
    'manifest',
  ],
  unavailableResources: [
    {
      resource: 'warehouse',
      reason: 'Xpressbees is a courier-only carrier; no warehouse or pickup-location listing API exists',
    },
  ],
} as const
