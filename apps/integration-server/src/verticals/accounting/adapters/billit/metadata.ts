export const metadata = {
  platform: 'billit',
  totalResources: 13,
  availableResources: [
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'order',
    'organization',
  ],
  unavailableResources: [
    {
      resource: 'account',
      reason: 'Billit has no chart-of-accounts or ledger-account API endpoint; /account is company info only (covered by organization)',
    },
    {
      resource: 'expense',
      reason: 'No expense management endpoint in the Billit API',
    },
    {
      resource: 'journal',
      reason: 'No journal or ledger-entry endpoint in the Billit API',
    },
    {
      resource: 'purchaseorder',
      reason: 'No dedicated purchase-order endpoint; purchase invoices surface as bills via /v1/orders with OrderDirection=Cost',
    },
    {
      resource: 'salesorder',
      reason: 'No dedicated sales-order endpoint; confirmed sales surface as invoices via /v1/orders with OrderDirection=Income',
    },
    {
      resource: 'taxrate',
      reason: 'Billit uses fixed ventilation codes embedded in orders; there is no list/get API endpoint for tax rates',
    },
    {
      resource: 'transaction',
      reason: 'No transaction or payment endpoint in the Billit API',
    },
  ],
} as const
