export const metadata = {
  platform: 'bind-erp',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'journal',
    'order',
    'organization',
    'salesorder',
  ],
  unavailableResources: [
    {
      resource: 'purchaseorder',
      reason: 'No purchase-order endpoint in the Bind ERP API; supplier bills are accessed via /api/Expenses/{id} (mapped to Bill)',
    },
    {
      resource: 'taxrate',
      reason: 'No tax-rate endpoint exists in the Bind ERP API (confirmed via official SDK)',
    },
    {
      resource: 'transaction',
      reason: 'No dedicated transaction endpoint; payments are sub-resources of invoices (/api/Invoices/Payment/{id}) and expenses (/api/Expenses/Payment/{id}) only',
    },
  ],
} as const
