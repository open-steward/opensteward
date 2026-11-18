export const metadata = {
  platform: 'rillet',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'journal',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'order',
      reason: 'Rillet has no order-management concept; sales flow via contracts and invoices',
    },
    {
      resource: 'salesorder',
      reason: 'No sales-order endpoint in the Rillet API (confirmed via OpenAPI spec)',
    },
    {
      resource: 'purchaseorder',
      reason: 'No purchase-order endpoint in the Rillet API (confirmed via OpenAPI spec)',
    },
  ],
} as const
