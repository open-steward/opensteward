export const metadata = {
  platform: 'vosfactures',
  totalResources: 13,
  availableResources: [
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'order',
    'organization',
    'salesorder',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        'No chart-of-accounts API exists; /account.json only creates new tenant accounts, not GL accounts.',
    },
    {
      resource: 'expense',
      reason:
        'No employee expense or expense-claim endpoint; supplier costs are modelled as income=0 invoices (Bill).',
    },
    {
      resource: 'journal',
      reason:
        'No general-ledger journal entry endpoint; invoice documents carry an accounting_status exported flag only.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'No dedicated purchase-order document kind; supplier invoices use income=0 (Bill).',
    },
    {
      resource: 'taxrate',
      reason:
        'No standalone tax-rate configuration endpoint; rates are embedded as strings inside invoice position objects.',
    },
  ],
} as const
