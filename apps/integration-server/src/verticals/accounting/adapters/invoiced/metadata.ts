export const metadata = {
  platform: 'invoiced',
  totalResources: 13,
  availableResources: [
    'contact',
    'creditmemo',
    'invoice',
    'taxrate',
    'transaction',
    'order',
    'salesorder',
  ],
  unavailableResources: [
    { resource: 'account', reason: 'Invoiced has no chart of accounts / GL account endpoint; it is an AR-only platform' },
    { resource: 'bill', reason: 'Invoiced has no accounts-payable or vendor bill endpoint' },
    { resource: 'expense', reason: 'Invoiced has no expense tracking endpoint' },
    { resource: 'journal', reason: 'Invoiced has no journal entries endpoint' },
    { resource: 'organization', reason: 'Invoiced has no organisation/company-settings endpoint' },
    { resource: 'purchaseorder', reason: 'Invoiced has no purchase order endpoint' },
  ],
} as const
