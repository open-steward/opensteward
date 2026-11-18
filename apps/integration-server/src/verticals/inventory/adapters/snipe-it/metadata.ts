export const metadata = {
  platform: 'snipe-it',
  totalResources: 7,
  availableResources: ['location', 'product', 'stock-level', 'supplier'],
  unavailableResources: [
    {
      resource: 'purchase-order',
      reason:
        'Snipe-IT is an IT asset-tracking tool and has no purchase-order concept or API endpoint.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'Snipe-IT tracks individual assets (qty=1 each) rather than bulk stock counts; no stock-adjustment endpoint exists in the API.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'Snipe-IT has no stock-transfer endpoint; asset reassignment between locations is a check-in/check-out workflow not exposed as a transferable batch.',
    },
  ],
} as const
