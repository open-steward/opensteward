export const metadata = {
  platform: 'mirakl',
  totalResources: 10,
  availableResources: [
    'customer',
    'discount',
    'fulfillment',
    'inventory',
    'location',
    'order',
    'product',
    'refund',
  ],
  unavailableResources: [
    {
      resource: 'collection',
      reason:
        'Mirakl hierarchies (/api/hierarchies) are operator-defined taxonomy trees, not merchant-curated product sets; no seller-writable collection concept exists in the seller API.',
    },
    {
      resource: 'transaction',
      reason:
        '/api/sellerpayment/transactions_logs returns accounting/settlement lines (commissions, fees, refunds) rather than payment gateway capture/auth events; there is no canonical payment transaction endpoint in the seller API.',
    },
  ],
} as const
