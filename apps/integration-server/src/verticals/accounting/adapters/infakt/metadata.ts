export const metadata = {
  platform: 'infakt',
  totalResources: 13,
  availableResources: [
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'taxrate',
  ],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        'inFakt has no chart-of-accounts concept; /bank_accounts.json lists payment bank accounts, not ledger accounts',
    },
    {
      resource: 'bill',
      reason:
        'inFakt is a sales-side platform for Polish sole proprietors; no supplier bill endpoint exists',
    },
    {
      resource: 'journal',
      reason:
        'No double-entry journal endpoint; /books.json is a Polish tax revenue/expense book (KPiR), not a journal ledger',
    },
    {
      resource: 'order',
      reason: 'No order endpoint in inFakt API v3',
    },
    {
      resource: 'organization',
      reason:
        'UNVERIFIED: /account/details.json endpoint is confirmed in official docs but response field names are not publicly documented',
    },
    {
      resource: 'purchaseorder',
      reason: 'No purchase-order endpoint in inFakt API v3',
    },
    {
      resource: 'salesorder',
      reason: 'No sales-order endpoint in inFakt API v3',
    },
    {
      resource: 'transaction',
      reason:
        'No dedicated transaction/payment resource; marking an invoice as paid is an action on invoices, not a queryable resource',
    },
  ],
} as const
