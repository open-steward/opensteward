export const metadata = {
  platform: 'manager',
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
    'purchaseorder',
    'salesorder',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'order',
      reason:
        'Manager has no generic order concept; it uses separate purchase-order (/api2/pending-purchase-orders) and sales-order (/api2/pending-sales-orders) resources.',
    },
  ],
} as const
