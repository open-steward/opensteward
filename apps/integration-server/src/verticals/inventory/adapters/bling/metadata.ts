export const metadata = {
  platform: 'bling',
  totalResources: 7,
  availableResources: [
    'location',
    'product',
    'purchase-order',
    'stock-level',
    'supplier',
  ],
  unavailableResources: [
    {
      resource: 'stock-adjustment',
      reason:
        'Bling API v3 has no GET endpoint to list or retrieve stock-adjustment records; POST /estoques creates movements but historical adjustment data is not queryable.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'Bling API v3 has no dedicated stock-transfer endpoint; inter-warehouse moves are paired Saída/Entrada movements with no separate transfer resource or list endpoint.',
    },
  ],
} as const
