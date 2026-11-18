export const metadata = {
  platform: 'saldeo',
  totalResources: 13,
  availableResources: [
    'organization',
    'invoice',
    'bill',
    'contact',
    'creditmemo',
  ],
  unavailableResources: [
    {
      resource: 'account',
      reason: 'SaldeoSMART API exposes no chart-of-accounts endpoint; confirmed from official docs at saldeo.brainshare.pl/static/doc/api/index.html',
    },
    {
      resource: 'journal',
      reason: 'No journal or general-ledger endpoint exists in the SaldeoSMART API',
    },
    {
      resource: 'transaction',
      reason: 'No transaction-level endpoint; API provides only document-level summaries, not bank/ledger transactions',
    },
    {
      resource: 'taxrate',
      reason: 'Tax rates are embedded as VAT_REGISTRY line items within documents; no standalone tax-rate listing endpoint exists',
    },
    {
      resource: 'expense',
      reason: 'SaldeoSMART has no employee-expense or expense-claim concept; the API does not expose such an endpoint',
    },
    {
      resource: 'order',
      reason: 'No order management concept or endpoint in the SaldeoSMART API',
    },
    {
      resource: 'salesorder',
      reason: 'No sales-order endpoint in the SaldeoSMART API',
    },
    {
      resource: 'purchaseorder',
      reason: 'No purchase-order endpoint in the SaldeoSMART API',
    },
  ],
} as const
