export const metadata = {
  platform: 'tipalti',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'invoice',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason:
        'Tipalti has no credit memo concept; it is a payee-driven AP platform with no AR credit workflow',
    },
    {
      resource: 'expense',
      reason: 'Tipalti REST API v1 has no employee expense management endpoints',
    },
    {
      resource: 'journal',
      reason:
        'Tipalti has no journal-entry endpoints; it syncs to external GL systems rather than maintaining its own ledger',
    },
    {
      resource: 'order',
      reason: 'Tipalti REST API v1 has no general-order endpoints',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Tipalti REST API v1 has no /purchase-orders endpoint; procurement flow is invoice-based',
    },
    {
      resource: 'salesorder',
      reason: 'Tipalti is an AP/payouts platform only; no sales-order concept exists',
    },
  ],
} as const
