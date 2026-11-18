export const metadata = {
  platform: 'terminal49',
  totalResources: 8,
  availableResources: ['carrier', 'shipment', 'trackingevent'],
  unavailableResources: [
    { resource: 'label', reason: 'Terminal49 is an ocean freight visibility API and does not generate shipping labels' },
    { resource: 'manifest', reason: 'Terminal49 does not support manifest creation' },
    { resource: 'order', reason: 'Terminal49 does not offer order management' },
    { resource: 'rate', reason: 'Terminal49 does not offer rate shopping or quoting' },
    { resource: 'warehouse', reason: 'Terminal49 does not provide warehouse management' },
  ],
} as const
