export const metadata = {
  platform: 'cargus',
  totalResources: 8,
  availableResources: ['label', 'order', 'rate', 'shipment', 'trackingevent', 'warehouse'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Cargus is the carrier; no carrier-listing endpoint exists in the API',
    },
    {
      resource: 'manifest',
      reason: 'No manifest or shipment-consolidation concept in the Cargus API',
    },
  ],
} as const
