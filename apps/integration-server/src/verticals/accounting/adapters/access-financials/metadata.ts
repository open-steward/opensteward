export const metadata = {
  platform: 'access-financials',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'invoice',
    'journal',
    'organization',
    'purchaseorder',
    'salesorder',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'expense',
      reason:
        'UNVERIFIED: Expense API exists at a separate base URL (expensews.accessacloud.com) requiring an additional X-Email admin header not collected by this adapter\'s credential form',
    },
    {
      resource: 'order',
      reason:
        'No generic order endpoint; platform only exposes salesorder and purchaseorder as separate resources',
    },
    {
      resource: 'taxrate',
      reason:
        'No dedicated tax rate master record in Financials GraphQL; tax codes appear only as inline fields on transaction lines',
    },
  ],
} as const
