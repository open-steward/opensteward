export const metadata = {
  platform: 'ledgersmb',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'invoice',
    'order',
    'organization',
    'salesorder',
    'purchaseorder',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason: 'No credit memo endpoint in LedgerSMB v0 REST API; Invoices.pm only exposes /invoices and /invoices/{id}',
    },
    {
      resource: 'expense',
      reason: 'No expense endpoint in LedgerSMB v0 REST API; no Expenses route module exists',
    },
    {
      resource: 'journal',
      reason: 'GeneralLedger.pm only exposes /gl/gifi (classification codes), not GL journal entry transactions',
    },
    {
      resource: 'taxrate',
      reason: 'No tax rate endpoint in LedgerSMB v0 REST API; Accounts.pm confirmed no tax-rate routes',
    },
    {
      resource: 'transaction',
      reason: 'No general transaction endpoint in LedgerSMB v0 REST API; GL transactions are not exposed through the REST layer',
    },
  ],
} as const
