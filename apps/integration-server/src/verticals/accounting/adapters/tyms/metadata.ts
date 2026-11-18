export const metadata = {
  platform: 'tyms',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'expense',
    'invoice',
    'journal',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason: 'Tyms has no credit note / credit memo concept or endpoint in its API',
    },
    {
      resource: 'order',
      reason: 'Tyms has no generic order workflow; the Sales resource records direct income, not orders',
    },
    {
      resource: 'salesorder',
      reason: 'Tyms has no sales order concept or endpoint in its API',
    },
    {
      resource: 'purchaseorder',
      reason: 'Tyms has no purchase order concept or endpoint in its API',
    },
  ],
} as const
