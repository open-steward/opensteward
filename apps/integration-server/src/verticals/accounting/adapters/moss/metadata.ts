export const metadata = {
  platform: 'moss',
  totalResources: 13,
  availableResources: [
    'account',
    'contact',
    'expense',
    'organization',
    'taxrate',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'bill',
      reason: 'Moss Public API v1 has no bill/accounts-payable endpoint; spend data flows through /v1/expenses.',
    },
    {
      resource: 'creditmemo',
      reason: 'Moss Public API v1 has no credit-memo endpoint; the platform does not expose this document type via API.',
    },
    {
      resource: 'invoice',
      reason: 'Moss Public API v1 has no standalone invoice endpoint; supplier invoices are retrieved as expense records via /v1/expenses.',
    },
    {
      resource: 'journal',
      reason: 'Moss Public API v1 has no journal endpoint; the platform does not expose journal entries via API.',
    },
    {
      resource: 'order',
      reason: 'Moss Public API v1 has no order endpoint; the platform does not support order management.',
    },
    {
      resource: 'purchaseorder',
      reason: 'Moss Public API v1 has no purchase-order endpoint; the platform does not support purchase orders.',
    },
    {
      resource: 'salesorder',
      reason: 'Moss Public API v1 has no sales-order endpoint; the platform does not support sales orders.',
    },
  ],
} as const
