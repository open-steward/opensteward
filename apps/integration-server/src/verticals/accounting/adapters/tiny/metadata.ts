export const metadata = {
  platform: 'tiny',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
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
      resource: 'creditmemo',
      reason:
        'Tiny ERP v3 has no dedicated credit memo or credit note endpoint; returns/devoluções are handled via Nota Fiscal cancellation',
    },
    {
      resource: 'expense',
      reason:
        'Tiny ERP v3 has no expense report endpoint; /categorias-receita-despesa lists expense categories only, not expense records',
    },
    {
      resource: 'journal',
      reason:
        'Tiny ERP v3 has no journal entry (lançamentos contábeis) endpoint in its public API',
    },
  ],
} as const
