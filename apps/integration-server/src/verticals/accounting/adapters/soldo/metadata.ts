export const metadata = {
  platform: 'soldo',
  totalResources: 13,
  availableResources: [
    'account',
    'contact',
    'expense',
    'organization',
    'transaction',
    'order',
    'taxrate',
  ],
  unavailableResources: [
    {
      resource: 'bill',
      reason:
        'Soldo has no accounts-payable bill concept; it is a spend-management platform, not a full AP/AR suite',
    },
    {
      resource: 'creditmemo',
      reason: 'No credit memo or credit note endpoint exists in the Soldo API',
    },
    {
      resource: 'invoice',
      reason: 'No customer invoice endpoint exists in the Soldo API',
    },
    {
      resource: 'journal',
      reason: 'No accounting journal endpoint exists in the Soldo API',
    },
    {
      resource: 'purchaseorder',
      reason:
        'No purchase order endpoint; Soldo orders are card-issuance orders, not AP purchase orders',
    },
    {
      resource: 'salesorder',
      reason: 'No sales order endpoint exists in the Soldo API',
    },
  ],
} as const
