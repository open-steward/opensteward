export const metadata = {
  platform: 'orca-scan',
  totalResources: 7,
  availableResources: ['location', 'product', 'stock-level'],
  unavailableResources: [
    {
      resource: 'supplier',
      reason:
        'Orca Scan has no supplier entity; the API covers only sheets, rows, fields, history, users, and webhooks',
    },
    {
      resource: 'purchase-order',
      reason:
        'Orca Scan has no purchase-order entity; the API covers only sheets, rows, fields, history, users, and webhooks',
    },
    {
      resource: 'stock-transfer',
      reason:
        'Orca Scan has no stock-transfer entity; the API covers only sheets, rows, fields, history, users, and webhooks',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'Orca Scan has no stock-adjustment entity; the API covers only sheets, rows, fields, history, users, and webhooks',
    },
  ],
} as const
