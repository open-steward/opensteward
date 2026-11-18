export const metadata = {
  platform: 'zto-express',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'order', 'label'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'ZTO is a single-carrier platform; no carrier listing endpoint exists in the open.zto.com API',
    },
    {
      resource: 'rate',
      reason: 'No rate/quote endpoint is available in the open.zto.com API',
    },
    {
      resource: 'manifest',
      reason: 'No manifest creation or listing endpoint is available in the open.zto.com API',
    },
    {
      resource: 'warehouse',
      reason: 'Warehouse management requires the separate ZTO Cloud Warehouse platform (ztocwst.com) with distinct credentials, not accessible via open.zto.com',
    },
  ],
} as const
