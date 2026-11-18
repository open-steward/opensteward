export const metadata = {
  platform: 'vhsys',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'order',
    'organization',
    'purchaseorder',
    'salesorder',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'journal',
      reason:
        'vhsys has no dedicated journal/lancamento-contabil REST endpoint; accounting journal data is exchanged only via proprietary integrations (Questor, Cordilheira) outside the public API',
    },
  ],
} as const
