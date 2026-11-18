export const metadata = {
  platform: 'cashctrl',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'invoice',
    'journal',
    'order',
    'organization',
    'purchaseorder',
    'salesorder',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason:
        'CashCtrl has no dedicated credit note endpoint; credit notes are user-defined order categories with no programmatic type filter at the API level.',
    },
    {
      resource: 'expense',
      reason:
        'CashCtrl has no expense endpoint; expenses are handled exclusively through journal entries.',
    },
  ],
} as const
