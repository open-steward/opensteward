export const metadata = {
  platform: 'ifirma',
  totalResources: 13,
  availableResources: [
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'organization',
    'taxrate',
  ],
  unavailableResources: [
    {
      resource: 'account',
      reason: 'No chart-of-accounts or general-ledger endpoint in the iFirma public API',
    },
    {
      resource: 'bill',
      reason:
        'Expense/purchase endpoints are write-only (POST); no vendor-bill list or get endpoint exists',
    },
    {
      resource: 'journal',
      reason: 'No journal-entry endpoint in the iFirma public API',
    },
    {
      resource: 'order',
      reason:
        'Only a write-only hub endpoint exists (/hub/user/platform/.../orders/order) with no list or get support and a different auth scheme',
    },
    {
      resource: 'purchaseorder',
      reason: 'Not documented anywhere in the iFirma public API',
    },
    {
      resource: 'salesorder',
      reason: 'Not documented anywhere in the iFirma public API',
    },
    {
      resource: 'transaction',
      reason: 'No payment or transaction list endpoint in the iFirma public API',
    },
  ],
} as const
