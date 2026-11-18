export const metadata = {
  platform: 'fakturownia',
  totalResources: 13,
  availableResources: [
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'account',
      reason: 'No chart of accounts in Fakturownia; /accounts.json is tenant administration only',
    },
    {
      resource: 'expense',
      reason: 'No distinct expense-report resource; cost invoices are covered by the bill resource',
    },
    {
      resource: 'journal',
      reason: 'No journal entry endpoint in Fakturownia API',
    },
    {
      resource: 'order',
      reason: 'No order resource; advance invoices are not a canonical order object',
    },
    {
      resource: 'purchaseorder',
      reason: 'No purchase order endpoint in Fakturownia API',
    },
    {
      resource: 'salesorder',
      reason: 'No sales order endpoint in Fakturownia API',
    },
  ],
} as const
