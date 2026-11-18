export const metadata = {
  platform: 'sinay',
  totalResources: 8,
  availableResources: ['carrier', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'label',
      reason: 'Sinay is a maritime container-tracking platform only; no label generation API exists',
    },
    {
      resource: 'manifest',
      reason: 'No manifest concept or endpoint in the Sinay/SafeCube API',
    },
    {
      resource: 'order',
      reason: 'No order management concept or endpoint in the Sinay/SafeCube API',
    },
    {
      resource: 'rate',
      reason: 'No freight-rate quoting concept or endpoint in the Sinay/SafeCube API',
    },
    {
      resource: 'warehouse',
      reason: 'No warehouse concept or endpoint in the Sinay/SafeCube API',
    },
  ],
} as const
