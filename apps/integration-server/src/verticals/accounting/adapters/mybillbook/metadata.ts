export const metadata = {
  platform: 'mybillbook',
  totalResources: 13,
  availableResources: ['organization', 'invoice', 'bill', 'contact'],
  unavailableResources: [
    { resource: 'account', reason: 'myBillBook exposes no chart-of-accounts API endpoint' },
    { resource: 'creditmemo', reason: 'myBillBook exposes no credit-note API endpoint' },
    { resource: 'expense', reason: 'myBillBook exposes no expenses API endpoint' },
    { resource: 'journal', reason: 'myBillBook exposes no journal-entries API endpoint' },
    { resource: 'order', reason: 'myBillBook exposes no orders API endpoint' },
    { resource: 'purchaseorder', reason: 'myBillBook exposes no purchase-orders API endpoint' },
    { resource: 'salesorder', reason: 'myBillBook exposes no sales-orders API endpoint' },
    { resource: 'taxrate', reason: 'myBillBook exposes no tax-rates API endpoint' },
    { resource: 'transaction', reason: 'myBillBook exposes no transactions API endpoint' },
  ],
} as const
