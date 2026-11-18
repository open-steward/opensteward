export const metadata = {
  platform: 'karbon',
  totalResources: 13,
  availableResources: [
    'contact',
    'invoice',
    'organization',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'account',
      reason: 'Karbon API v3 has no GL accounts endpoint; TenantSettings returns work/contact config only',
    },
    {
      resource: 'bill',
      reason: 'Karbon API v3 has no Bills endpoint; platform does not model supplier bills',
    },
    {
      resource: 'creditmemo',
      reason: 'Karbon API v3 has no CreditMemos or credit-note endpoint',
    },
    {
      resource: 'expense',
      reason: 'Karbon API v3 has no Expenses endpoint; platform does not model employee expenses',
    },
    {
      resource: 'journal',
      reason: 'Karbon API v3 has no Journals endpoint; platform does not expose journal entries',
    },
    {
      resource: 'order',
      reason: 'Karbon API v3 has no Orders endpoint; platform does not model sales/purchase orders',
    },
    {
      resource: 'purchaseorder',
      reason: 'Karbon API v3 has no PurchaseOrders endpoint; platform does not model purchase orders',
    },
    {
      resource: 'salesorder',
      reason: 'Karbon API v3 has no SalesOrders endpoint; platform does not model sales orders',
    },
    {
      resource: 'taxrate',
      reason: 'Karbon API v3 has no TaxRates endpoint; tax rates are not exposed via the API',
    },
  ],
} as const
