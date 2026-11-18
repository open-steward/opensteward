export const metadata = {
  platform: 'abacus-ch',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'expense',
    'invoice',
    'journal',
    'organization',
    'salesorder',
    'taxrate',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason:
        'Abacus REST API does not expose a CreditNotes entity set; credit notes are not accessible via the documented OData API',
    },
    {
      resource: 'order',
      reason:
        'No generic Orders entity set in Abacus REST API; orders are split into SalesOrders (available) and PurchaseOrders (unavailable) with no unified Orders endpoint',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Abacus REST API does not expose a PurchaseOrders entity set; confirmed absent by Abacus integration partners',
    },
    {
      resource: 'transaction',
      reason:
        'Abacus REST API does not expose a Transactions entity set; financial transactions are not accessible via the documented OData API',
    },
  ],
} as const
