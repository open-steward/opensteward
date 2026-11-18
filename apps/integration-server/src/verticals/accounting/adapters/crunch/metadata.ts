export const metadata = {
  platform: 'crunch',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'journal',
      reason:
        'Crunch public API has no journal/ledger endpoint; the developer portal lists no such resource.',
    },
    {
      resource: 'order',
      reason:
        'Crunch public API has no orders concept; the developer portal does not document any orders endpoint.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Crunch public API has no purchase orders endpoint; not listed on the developer portal.',
    },
    {
      resource: 'salesorder',
      reason:
        'Crunch public API has no sales orders endpoint; not listed on the developer portal.',
    },
  ],
} as const
