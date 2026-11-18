export const metadata = {
  platform: 'gocodes',
  totalResources: 7,
  availableResources: ['location', 'product', 'stock-level'],
  unavailableResources: [
    {
      resource: 'purchase-order',
      reason:
        'GoCodes is an asset-tracking platform; purchase orders are not a concept in the product and no /purchase_orders endpoint exists in the public API.',
    },
    {
      resource: 'stock-adjustment',
      reason:
        'GoCodes has no stock-adjustment concept or endpoint; inventory quantities are derived solely from asset-presence, not adjustment transactions.',
    },
    {
      resource: 'stock-transfer',
      reason:
        'GoCodes has no stock-transfer concept or endpoint; asset reassignment between locations is recorded on the asset record, not as transfer documents.',
    },
    {
      resource: 'supplier',
      reason:
        'GoCodes has no supplier/vendor concept or endpoint; procurement and vendor management are outside the scope of the platform.',
    },
  ],
} as const
