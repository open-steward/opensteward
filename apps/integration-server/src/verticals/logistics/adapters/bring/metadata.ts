export const metadata = {
  platform: 'bring',
  totalResources: 8,
  availableResources: ['shipment', 'trackingevent', 'rate', 'order'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Bring is the sole carrier; no carrier-listing endpoint exists in the API',
    },
    {
      resource: 'label',
      reason: 'Labels are embedded in the booking response only; no standalone label list/get API exists',
    },
    {
      resource: 'manifest',
      reason: 'No manifest endpoint exists in the Bring API',
    },
    {
      resource: 'warehouse',
      reason: 'Warehousing API is write-only (send orders to warehouse); no GET endpoint for warehouse metadata exists',
    },
  ],
} as const
