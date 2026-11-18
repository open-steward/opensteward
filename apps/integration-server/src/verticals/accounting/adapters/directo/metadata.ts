export const metadata = {
  platform: 'directo',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'invoice',
    'journal',
    'order',
    'organization',
    'purchaseorder',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason:
        'Directo REST API has no credit memo or credit note endpoint; credit adjustments are handled via negative invoices in the UI only.',
    },
    {
      resource: 'expense',
      reason:
        'Directo REST API has no expenses endpoint; the expenses feature is UI-only with no corresponding /v1/expenses or equivalent resource.',
    },
    {
      resource: 'salesorder',
      reason:
        "Directo's /orders endpoint is already consumed by the canonical Order resource; no distinct sales-order endpoint exists. The /sales_quotations endpoint represents pre-sales quotations, not confirmed sales orders.",
    },
  ],
} as const
