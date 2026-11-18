export const metadata = {
  platform: 'transportify',
  totalResources: 8,
  availableResources: ['carrier', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason: 'Transportify is a courier booking platform; drivers handle pickup/delivery without label generation — no label endpoint exists in the public API',
    },
    {
      resource: 'manifest',
      reason: 'No manifest concept exists in the Deliveree/Transportify public API',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse or storage management concept in the Deliveree/Transportify public API',
    },
  ],
} as const
