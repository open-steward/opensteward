export const metadata = {
  platform: 'cheqroom',
  totalResources: 7,
  availableResources: ['location', 'product'],
  unavailableResources: [
    {
      resource: 'purchase-order',
      reason:
        'Cheqroom is an equipment-tracking platform; it has no procurement or purchasing concept. The v2_5 API exposes no purchase-order endpoint.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'Cheqroom tracks individually-identified physical assets, not fungible quantities; there is no inventory-count or stock-correction endpoint in the v2_5 API.',
    },
    {
      resource: 'stock-level',
      reason:
        'Cheqroom tracks individually-identified physical assets rather than quantity-on-hand; the v2_5 API has no stock-level endpoint.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'Cheqroom has no inter-location stock-transfer concept or endpoint in the v2_5 API; item custody changes are tracked via checkout/check-in orders, not transfers.',
    },
    {
      resource: 'supplier',
      reason:
        'Cheqroom has no vendor or supplier concept; the v2_5 API exposes no supplier endpoint.',
    },
  ],
} as const
