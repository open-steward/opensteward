export const metadata = {
  platform: 'sellbrite',
  totalResources: 7,
  availableResources: ['location', 'product', 'stock-level'],
  unavailableResources: [
    {
      resource: 'purchase-order',
      reason: 'Sellbrite API has no purchase-order concept or endpoint; the platform delegates purchasing to connected channels.',
    },
    {
      resource: 'stock-adjustment',
      reason: 'Sellbrite API supports writing inventory adjustments via PATCH /inventory but exposes no audit-log or history endpoint to read past adjustments.',
    },
    {
      resource: 'stock-transfer',
      reason: 'Sellbrite API has no stock-transfer concept or endpoint; inter-warehouse movement is not modelled.',
    },
    {
      resource: 'supplier',
      reason: 'Sellbrite API has no supplier concept or endpoint; vendor management is outside the scope of the platform.',
    },
  ],
} as const
