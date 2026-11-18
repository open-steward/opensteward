export const metadata = {
  platform: 'bigcapital',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'journal',
    'organization',
    'taxrate',
    'salesorder',
  ],
  unavailableResources: [
    {
      resource: 'transaction',
      reason:
        '/api/banking/transactions requires a mandatory bank accountId and returns bank-feed withdrawal/deposit entries (no standalone id); getTransaction(id) cannot be satisfied',
    },
    {
      resource: 'order',
      reason:
        'Bigcapital has no generic order resource; the sales flow uses invoices and the purchase flow uses bills — no /orders endpoint exists',
    },
    {
      resource: 'purchaseorder',
      reason:
        'No dedicated purchase order endpoint; bills serve this role and are already mapped as the bill resource',
    },
  ],
} as const
